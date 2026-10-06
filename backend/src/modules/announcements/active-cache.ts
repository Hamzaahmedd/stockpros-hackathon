import { AnnouncementStatus } from '@prisma/client'
import {
  deleteCache,
  getCache,
  setCache,
} from '../../shared/infrastructure/cache'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import { CACHE_TTL } from '../../shared/constants/cache-constants'
import { ACTIVE_LIST_MAX, ANNOUNCEMENT_CACHE_KEYS } from './constants'
import type { ActiveAnnouncement } from './types'

/**
 * Three layers, cheapest first:
 *  L1 in-process (seconds)  -> L2 Redis (shared)  -> L3 PostgreSQL.
 * Concurrent misses share one load (single-flight) so a cold cache or an
 * invalidation can never stampede the database.
 */
let l1: { entries: ActiveAnnouncement[]; expiresAtMs: number } | null = null
let inflight: Promise<ActiveAnnouncement[]> | null = null
// Bumped on every invalidation; a load that started before one must not repopulate the caches.
let generation = 0

const loadFromDatabase = async (
  nowMs: number,
): Promise<ActiveAnnouncement[]> => {
  const rows = await prisma.announcement.findMany({
    where: {
      status: AnnouncementStatus.PUBLISHED,
      isEnabled: true,
      OR: [{ endsAt: null }, { endsAt: { gt: new Date(nowMs) } }],
    },
    orderBy: { publishedAt: 'desc' },
    take: ACTIVE_LIST_MAX,
  })
  return rows.map((row) => ({
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
    startsAtMs: row.startsAt?.getTime() ?? null,
    endsAtMs: row.endsAt?.getTime() ?? null,
    publishedAtMs: (row.publishedAt ?? row.createdAt).getTime(),
    reannounceEpoch: row.reannounceEpoch,
  }))
}

const load = async (nowMs: number): Promise<ActiveAnnouncement[]> => {
  const startedAt = generation
  const shared = await getCache<ActiveAnnouncement[]>(
    ANNOUNCEMENT_CACHE_KEYS.ACTIVE_LIST,
  )
  const hit = Array.isArray(shared)
  const entries = hit ? shared : await loadFromDatabase(nowMs)

  if (startedAt === generation) {
    if (!hit) {
      await setCache(
        ANNOUNCEMENT_CACHE_KEYS.ACTIVE_LIST,
        entries,
        CACHE_TTL.ANNOUNCEMENTS.ACTIVE_LIST,
      )
    }
    l1 = { entries, expiresAtMs: nowMs + CACHE_TTL.ANNOUNCEMENTS.L1_MS }
  }
  return entries
}

/** The published, enabled announcements. Schedule windows are evaluated by the caller at request time. */
export const getActiveAnnouncements = (
  nowMs: number = Date.now(),
): Promise<ActiveAnnouncement[]> => {
  if (l1 && l1.expiresAtMs > nowMs) return Promise.resolve(l1.entries)
  inflight ??= load(nowMs).finally(() => {
    inflight = null
  })
  return inflight
}

/** Drops this instance's L1 and the shared Redis list. Call after every announcement write. */
export const invalidateActiveAnnouncements = async (): Promise<void> => {
  generation += 1
  l1 = null
  inflight = null
  try {
    await deleteCache(ANNOUNCEMENT_CACHE_KEYS.ACTIVE_LIST)
  } catch (err) {
    logger.warn(
      `[Announcements] cache invalidation failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
