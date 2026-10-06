import {
  AdminAuditAction,
  AnnouncementStatus,
  type Announcement,
  type Prisma,
} from '@prisma/client'
import {
  ConflictError,
  NotFoundError,
  validateOrThrow,
} from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import { announcementsChanged } from '../announcements/public'
import { AdminTargetType, logAdminAction } from '../access-control'
import {
  announcementContentValidator,
  type AnnouncementContent,
  type CreateAnnouncementInput,
  type UpdateAnnouncementInput,
} from './announcement-validation'
import type { AdminWriteContext } from './types'

type Tx = Prisma.TransactionClient

export interface AnnouncementListFilter {
  page: number
  limit: number
  status?: AnnouncementStatus
  placement?: Announcement['placement']
}

const iso = (date: Date | null): string | null => date?.toISOString() ?? null

/** Admin-facing view of an announcement (everything staff may edit, plus lifecycle state). */
export const toAdminDto = (row: Announcement) => ({
  id: row.id,
  title: row.title,
  body: row.body,
  ctaLabel: row.ctaLabel,
  ctaUrl: row.ctaUrl,
  imageUrl: row.imageUrl,
  placement: row.placement,
  severity: row.severity,
  anchor: row.anchor,
  navKey: row.navKey,
  priority: row.priority,
  dismissible: row.dismissible,
  inChangelog: row.inChangelog,
  targetPlans: row.targetPlans,
  targetRoles: row.targetRoles,
  startsAt: iso(row.startsAt),
  endsAt: iso(row.endsAt),
  publishedAt: iso(row.publishedAt),
  status: row.status,
  isEnabled: row.isEnabled,
  version: row.version,
  reannounceEpoch: row.reannounceEpoch,
  createdBy: row.createdBy,
  updatedBy: row.updatedBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export type AdminAnnouncement = ReturnType<typeof toAdminDto>

/** The editable fields of a stored row, in the shape the content validator accepts. */
const toContentInput = (row: Announcement) => ({
  title: row.title,
  body: row.body,
  ctaLabel: row.ctaLabel,
  ctaUrl: row.ctaUrl,
  imageUrl: row.imageUrl,
  placement: row.placement,
  severity: row.severity,
  anchor: row.anchor,
  navKey: row.navKey,
  priority: row.priority,
  dismissible: row.dismissible,
  inChangelog: row.inChangelog,
  targetPlans: row.targetPlans,
  targetRoles: row.targetRoles,
  startsAt: iso(row.startsAt),
  endsAt: iso(row.endsAt),
})

const toDate = (value: string | null | undefined): Date | null =>
  value ? new Date(value) : null

const toWriteData = (content: AnnouncementContent) => ({
  title: content.title,
  body: content.body,
  ctaLabel: content.ctaLabel ?? null,
  ctaUrl: content.ctaUrl ?? null,
  imageUrl: content.imageUrl ?? null,
  placement: content.placement,
  severity: content.severity ?? null,
  anchor: content.anchor ?? null,
  navKey: content.navKey ?? null,
  priority: content.priority,
  dismissible: content.dismissible,
  inChangelog: content.inChangelog,
  targetPlans: content.targetPlans,
  targetRoles: content.targetRoles,
  startsAt: toDate(content.startsAt),
  endsAt: toDate(content.endsAt),
})

const CONTENT_KEYS = Object.keys(
  toContentInput({} as Announcement),
) as ReadonlyArray<keyof ReturnType<typeof toContentInput>>

const fetchOrThrow = async (tx: Tx, id: string): Promise<Announcement> => {
  const row = await tx.announcement.findUnique({ where: { id } })
  if (!row) throw new NotFoundError('Announcement not found')
  return row
}

/**
 * Applies a change only if nobody else changed the row since it was read, and
 * bumps its version. Returns the stored row.
 */
const commitChange = async (
  tx: Tx,
  row: Announcement,
  adminId: string,
  data: Prisma.AnnouncementUpdateManyMutationInput,
): Promise<Announcement> => {
  const { count } = await tx.announcement.updateMany({
    where: { id: row.id, version: row.version },
    data: { ...data, updatedBy: adminId, version: { increment: 1 } },
  })
  if (count === 0) {
    throw new ConflictError(
      'This announcement was changed by someone else. Reload and try again.',
    )
  }
  return fetchOrThrow(tx, row.id)
}

/** Drops the caches and pushes the change. Runs after the commit and never fails the request. */
const afterCommit = async (): Promise<void> => {
  try {
    await announcementsChanged()
  } catch (err) {
    logger.warn(
      `[Admin] announcement cache refresh failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

const audit = (
  tx: Tx,
  ctx: AdminWriteContext,
  action: AdminAuditAction,
  announcementId: string,
  metadata: Prisma.InputJsonObject,
) =>
  logAdminAction(tx, {
    adminId: ctx.adminId,
    action,
    targetType: AdminTargetType.ANNOUNCEMENT,
    targetId: announcementId,
    reason: ctx.reason,
    ticketRef: ctx.ticketRef,
    ipAddress: ctx.ipAddress,
    metadata,
  })

export async function listAnnouncements(filter: AnnouncementListFilter) {
  const where: Prisma.AnnouncementWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.placement ? { placement: filter.placement } : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.announcement.count({ where }),
  ])
  return {
    items: rows.map(toAdminDto),
    total,
    page: filter.page,
    limit: filter.limit,
  }
}

export async function getAnnouncement(id: string) {
  const row = await fetchOrThrow(prisma, id)
  const [seen, dismissed] = await Promise.all([
    prisma.announcementUserState.count({
      where: {
        announcementId: id,
        epoch: row.reannounceEpoch,
        seenAt: { not: null },
      },
    }),
    prisma.announcementUserState.count({
      where: {
        announcementId: id,
        epoch: row.reannounceEpoch,
        dismissedAt: { not: null },
      },
    }),
  ])
  return { ...toAdminDto(row), engagement: { seen, dismissed } }
}

export async function createAnnouncement(
  ctx: AdminWriteContext,
  input: CreateAnnouncementInput,
): Promise<AdminAnnouncement> {
  const content = validateOrThrow(announcementContentValidator, input)

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.announcement.create({
      data: {
        ...toWriteData(content),
        status: AnnouncementStatus.DRAFT,
        createdBy: ctx.adminId,
        updatedBy: ctx.adminId,
      },
    })
    await audit(tx, ctx, AdminAuditAction.ANNOUNCEMENT_CREATED, row.id, {
      placement: row.placement,
    })
    return row
  })

  // A draft is never served, so there is nothing to invalidate.
  return toAdminDto(created)
}

export async function updateAnnouncement(
  ctx: AdminWriteContext,
  id: string,
  input: UpdateAnnouncementInput,
): Promise<AdminAnnouncement> {
  const updated = await prisma.$transaction(async (tx) => {
    const row = await fetchOrThrow(tx, id)
    if (row.status === AnnouncementStatus.ARCHIVED) {
      throw new ConflictError('An archived announcement cannot be edited')
    }
    if (row.version !== input.expectedVersion) {
      throw new ConflictError(
        'This announcement was changed by someone else. Reload and try again.',
      )
    }

    const before = toContentInput(row)
    const patch = Object.fromEntries(
      CONTENT_KEYS.filter((key) => input[key] !== undefined).map((key) => [
        key,
        input[key],
      ]),
    )
    const content = validateOrThrow(announcementContentValidator, {
      ...before,
      ...patch,
    })
    const next = toWriteData(content)
    const after = toContentInput({ ...row, ...next })
    const changedFields = CONTENT_KEYS.filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    )
    if (changedFields.length === 0) {
      throw new ConflictError('Nothing to change')
    }

    const stored = await commitChange(tx, row, ctx.adminId, next)
    await audit(tx, ctx, AdminAuditAction.ANNOUNCEMENT_UPDATED, id, {
      changedFields,
      version: stored.version,
    })
    return stored
  })

  await afterCommit()
  return toAdminDto(updated)
}

export async function publishAnnouncement(
  ctx: AdminWriteContext,
  id: string,
): Promise<AdminAnnouncement> {
  const published = await prisma.$transaction(async (tx) => {
    const row = await fetchOrThrow(tx, id)
    if (row.status !== AnnouncementStatus.DRAFT) {
      throw new ConflictError('Only a draft can be published')
    }
    if (row.endsAt && row.endsAt.getTime() <= Date.now()) {
      throw new ConflictError('endsAt is already in the past')
    }

    const stored = await commitChange(tx, row, ctx.adminId, {
      status: AnnouncementStatus.PUBLISHED,
      publishedAt: new Date(),
    })
    await audit(tx, ctx, AdminAuditAction.ANNOUNCEMENT_PUBLISHED, id, {
      placement: row.placement,
      isEnabled: row.isEnabled,
    })
    return stored
  })

  await afterCommit()
  return toAdminDto(published)
}

/**
 * The emergency kill switch. Switching OFF is open to support staff; switching
 * back ON is a platform-admin action (enforced by the route). Already in the
 * requested state is a no-op: no write, no audit row.
 */
export async function setAnnouncementEnabled(
  ctx: AdminWriteContext,
  id: string,
  isEnabled: boolean,
): Promise<AdminAnnouncement & { changed: boolean }> {
  const result = await prisma.$transaction(async (tx) => {
    const row = await fetchOrThrow(tx, id)
    if (row.status === AnnouncementStatus.ARCHIVED) {
      throw new ConflictError('An archived announcement cannot be switched')
    }
    if (row.isEnabled === isEnabled) return { stored: row, changed: false }

    const stored = await commitChange(tx, row, ctx.adminId, { isEnabled })
    await audit(
      tx,
      ctx,
      AdminAuditAction.ANNOUNCEMENT_KILL_SWITCH_TOGGLED,
      id,
      { isEnabled, previousIsEnabled: row.isEnabled },
    )
    return { stored, changed: true }
  })

  if (result.changed) await afterCommit()
  return { ...toAdminDto(result.stored), changed: result.changed }
}

/** Clears every user's dismissal and read state by starting a new epoch. */
export async function reannounceAnnouncement(
  ctx: AdminWriteContext,
  id: string,
): Promise<AdminAnnouncement> {
  const stored = await prisma.$transaction(async (tx) => {
    const row = await fetchOrThrow(tx, id)
    if (row.status !== AnnouncementStatus.PUBLISHED) {
      throw new ConflictError(
        'Only a published announcement can be re-announced',
      )
    }

    const next = await commitChange(tx, row, ctx.adminId, {
      reannounceEpoch: row.reannounceEpoch + 1,
    })
    await audit(tx, ctx, AdminAuditAction.ANNOUNCEMENT_REANNOUNCED, id, {
      previousEpoch: row.reannounceEpoch,
      reannounceEpoch: next.reannounceEpoch,
    })
    return next
  })

  await afterCommit()
  return toAdminDto(stored)
}

/** Soft delete: the row stays for the audit trail but is never served again. */
export async function archiveAnnouncement(
  ctx: AdminWriteContext,
  id: string,
): Promise<AdminAnnouncement> {
  const stored = await prisma.$transaction(async (tx) => {
    const row = await fetchOrThrow(tx, id)
    if (row.status === AnnouncementStatus.ARCHIVED) {
      throw new ConflictError('The announcement is already archived')
    }

    const next = await commitChange(tx, row, ctx.adminId, {
      status: AnnouncementStatus.ARCHIVED,
    })
    await audit(tx, ctx, AdminAuditAction.ANNOUNCEMENT_ARCHIVED, id, {
      previousStatus: row.status,
    })
    return next
  })

  await afterCommit()
  return toAdminDto(stored)
}
