import { AnnouncementStatus, type Prisma } from '@prisma/client'
import { ConflictError, NotFoundError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { getActiveAnnouncements } from './active-cache'
import { CHANGELOG_DEFAULT_PAGE_SIZE } from './constants'
import { cacheUserStates, loadUserStates } from './state-store'
import {
  buildChangelog,
  eligibleFor,
  evaluateForUser,
  isInWindow,
  matchesAudience,
} from './targeting'
import type {
  AnnouncementBootPayload,
  AnnouncementDto,
  AudienceContext,
  UserAnnouncementState,
} from './types'

export enum StateAction {
  SEEN = 'SEEN',
  DISMISSED = 'DISMISSED',
}

/**
 * The state after an action. Anything recorded under an older re-announce
 * epoch is discarded rather than carried over, so a reset really does start
 * the announcement afresh. Dismissing also marks the item read.
 */
export const nextUserState = (
  existing: UserAnnouncementState | undefined,
  epoch: number,
  action: StateAction,
): UserAnnouncementState => {
  const base =
    existing?.epoch === epoch
      ? existing
      : { epoch, seen: false, dismissed: false }
  return action === StateAction.DISMISSED
    ? { ...base, seen: true, dismissed: true }
    : { ...base, seen: true }
}

const persistState = (
  userId: string,
  announcementId: string,
  state: UserAnnouncementState,
  now: Date,
): Prisma.PrismaPromise<unknown> => {
  const data = {
    epoch: state.epoch,
    seenAt: state.seen ? now : null,
    dismissedAt: state.dismissed ? now : null,
  }
  return prisma.announcementUserState.upsert({
    where: { userId_announcementId: { userId, announcementId } },
    create: { userId, announcementId, ...data },
    update: data,
  })
}

/** The announcements slice of the app-boot payload: no database access on the warm path. */
export const getBootPayload = async (
  userId: string,
  audience: AudienceContext,
  nowMs: number = Date.now(),
): Promise<AnnouncementBootPayload> => {
  const [active, states] = await Promise.all([
    getActiveAnnouncements(nowMs),
    loadUserStates(userId),
  ])
  return evaluateForUser(active, audience, states, nowMs)
}

export interface ChangelogPage {
  items: AnnouncementDto[]
  total: number
  unreadCount: number
}

export const listChangelog = async (
  userId: string,
  audience: AudienceContext,
  page: { limit?: number; offset?: number } = {},
  nowMs: number = Date.now(),
): Promise<ChangelogPage> => {
  const [active, states] = await Promise.all([
    getActiveAnnouncements(nowMs),
    loadUserStates(userId),
  ])
  const all = buildChangelog(eligibleFor(active, audience, nowMs), states)
  const offset = page.offset ?? 0
  const limit = page.limit ?? CHANGELOG_DEFAULT_PAGE_SIZE
  return {
    items: all.slice(offset, offset + limit),
    total: all.length,
    unreadCount: all.filter((item) => item.unread).length,
  }
}

/**
 * Records an interaction for the caller only: the user id always comes from
 * the session, never the request. PostgreSQL first (source of truth), then a
 * best-effort Redis mirror. Idempotent.
 */
export const recordAction = async (
  userId: string,
  announcementId: string,
  action: StateAction,
  now: Date = new Date(),
): Promise<void> => {
  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    select: {
      id: true,
      status: true,
      isEnabled: true,
      dismissible: true,
      reannounceEpoch: true,
    },
  })
  if (
    announcement?.status !== AnnouncementStatus.PUBLISHED ||
    !announcement.isEnabled
  ) {
    throw new NotFoundError('Announcement not found')
  }
  if (action === StateAction.DISMISSED && !announcement.dismissible) {
    throw new ConflictError('This announcement cannot be dismissed')
  }

  const existing = (await loadUserStates(userId)).get(announcementId)
  const next = nextUserState(existing, announcement.reannounceEpoch, action)
  await persistState(userId, announcementId, next, now)
  await cacheUserStates(userId, new Map([[announcementId, next]]))
}

const isReadAtCurrentEpoch = (
  state: UserAnnouncementState | undefined,
  epoch: number,
): boolean => state?.epoch === epoch && state.seen

/** Marks every changelog entry the caller can currently see as read. Returns how many changed. */
export const markAllSeen = async (
  userId: string,
  audience: AudienceContext,
  now: Date = new Date(),
): Promise<number> => {
  const nowMs = now.getTime()
  const [active, states] = await Promise.all([
    getActiveAnnouncements(nowMs),
    loadUserStates(userId),
  ])
  const unread = active.filter(
    (item) =>
      item.inChangelog &&
      isInWindow(item, nowMs) &&
      matchesAudience(item, audience) &&
      !isReadAtCurrentEpoch(states.get(item.id), item.reannounceEpoch),
  )
  if (unread.length === 0) return 0

  const updates = new Map(
    unread.map((item) => [
      item.id,
      nextUserState(
        states.get(item.id),
        item.reannounceEpoch,
        StateAction.SEEN,
      ),
    ]),
  )
  await prisma.$transaction(
    [...updates].map(([id, state]) => persistState(userId, id, state, now)),
  )
  await cacheUserStates(userId, updates)
  return updates.size
}
