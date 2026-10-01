import { prisma } from '../../shared/infrastructure/database'
import { NotFoundError } from '../../shared/errors'
import { redactPii } from '../../shared/utils/redact'
import { AdminTargetType, logAdminRead } from '../access-control'
import { TimelineEventType } from './constants'
import type { AdminReadContext } from './types'

export interface TimelineQuery {
  limit: number
  /** Cursor: only events strictly older than this instant. */
  before?: Date
}

export interface TimelineEvent {
  id: string
  type: TimelineEventType
  title: string
  detail: string | null
  ticketRef: string | null
  at: string
}

const label = (value: string): string => {
  const words = value.toLowerCase().replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * A support-oriented history of one customer assembled from the system's own
 * transactional records: payments, credit movements, sessions, workspace
 * changes and staff actions. Deliberately excludes product-usage analytics
 * (that belongs in PostHog) and carries no IPs, user agents or raw payloads.
 */
export async function getUserTimeline(
  ctx: AdminReadContext,
  userId: string,
  query: TimelineQuery,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  })
  if (!user) throw new NotFoundError('User not found')

  const createdAt = query.before ? { lt: query.before } : undefined
  // One extra row per source lets us tell whether older events remain.
  const take = query.limit + 1
  const newestFirst = { createdAt: 'desc' as const }

  const [payments, credits, sessions, teamEvents, staffActions] =
    await Promise.all([
      prisma.paymentTransaction.findMany({
        where: { userId, createdAt },
        orderBy: newestFirst,
        take,
        select: {
          id: true,
          kind: true,
          status: true,
          planTier: true,
          amountPaisa: true,
          createdAt: true,
        },
      }),
      prisma.creditLedger.findMany({
        where: { userId, createdAt },
        orderBy: newestFirst,
        take,
        select: {
          id: true,
          type: true,
          amountPaisa: true,
          description: true,
          createdAt: true,
        },
      }),
      prisma.userSession.findMany({
        where: { userId, createdAt },
        orderBy: newestFirst,
        take,
        select: { id: true, isRevoked: true, createdAt: true },
      }),
      prisma.teamAuditLog.findMany({
        where: {
          OR: [{ targetUserId: userId }, { actorUserId: userId }],
          createdAt,
        },
        orderBy: newestFirst,
        take,
        select: { id: true, action: true, teamId: true, createdAt: true },
      }),
      prisma.adminAuditLog.findMany({
        where: { targetId: userId, createdAt },
        orderBy: newestFirst,
        take,
        select: {
          id: true,
          action: true,
          reason: true,
          ticketRef: true,
          createdAt: true,
          admin: { select: { displayName: true } },
        },
      }),
    ])

  const events: TimelineEvent[] = [
    ...payments.map((row) => ({
      id: row.id,
      type: TimelineEventType.PAYMENT,
      title: `${label(row.kind)} payment ${row.status.toLowerCase()}`,
      detail: `${row.planTier} · ${row.amountPaisa} paisa`,
      ticketRef: null,
      at: row.createdAt.toISOString(),
    })),
    ...credits.map((row) => ({
      id: row.id,
      type: TimelineEventType.CREDIT,
      title: `Credit ${label(row.type)}`,
      detail: `${row.amountPaisa} paisa · ${redactPii(row.description)}`,
      ticketRef: null,
      at: row.createdAt.toISOString(),
    })),
    ...sessions.map((row) => ({
      id: row.id,
      type: TimelineEventType.SESSION,
      title: row.isRevoked ? 'Signed in (since revoked)' : 'Signed in',
      detail: null,
      ticketRef: null,
      at: row.createdAt.toISOString(),
    })),
    ...teamEvents.map((row) => ({
      id: row.id,
      type: TimelineEventType.TEAM,
      title: `Workspace: ${label(row.action)}`,
      detail: `team ${row.teamId}`,
      ticketRef: null,
      at: row.createdAt.toISOString(),
    })),
    ...staffActions.map((row) => ({
      id: row.id,
      type: TimelineEventType.STAFF_ACTION,
      title: `Staff: ${label(row.action)}`,
      detail: `${row.admin.displayName ?? 'staff'} · ${row.reason}`,
      ticketRef: row.ticketRef,
      at: row.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))

  const items = events.slice(0, query.limit)
  const nextBefore =
    events.length > query.limit ? (items.at(-1)?.at ?? null) : null

  await logAdminRead(prisma, {
    adminId: ctx.adminId,
    ipAddress: ctx.ipAddress,
    targetType: AdminTargetType.USER,
    resultIds: [userId],
  })

  return { items, nextBefore }
}
