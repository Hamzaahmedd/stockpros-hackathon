import config from '@/config'
import { CACHE_TTL } from '../../shared/constants/cache-constants'
import {
  getRawRedisClient,
  resolveTtl,
} from '../../shared/infrastructure/cache'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import { ANNOUNCEMENT_CACHE_KEYS, USER_STATE_SENTINEL_FIELD } from './constants'
import type { UserAnnouncementState, UserStateMap } from './types'

/**
 * Per-user seen/dismissed state. PostgreSQL is the source of truth; Redis is a
 * read-through hash (field = announcement id, value = "epoch|seen|dismissed")
 * so the boot path normally never touches the database.
 */
const encode = (state: UserAnnouncementState): string =>
  `${state.epoch}|${state.seen ? 1 : 0}|${state.dismissed ? 1 : 0}`

const decode = (value: string): UserAnnouncementState | null => {
  const [epoch, seen, dismissed] = value.split('|')
  const parsed = Number(epoch)
  return Number.isInteger(parsed)
    ? { epoch: parsed, seen: seen === '1', dismissed: dismissed === '1' }
    : null
}

const redis = () => (config.cache.enabled ? getRawRedisClient() : null)

const readRedis = async (userId: string): Promise<UserStateMap | null> => {
  const client = redis()
  if (!client) return null
  try {
    const fields = await client.hgetall(
      ANNOUNCEMENT_CACHE_KEYS.userState(userId),
    )
    if (fields[USER_STATE_SENTINEL_FIELD] === undefined) return null
    const states = new Map<string, UserAnnouncementState>()
    for (const [id, value] of Object.entries(fields)) {
      const state = id === USER_STATE_SENTINEL_FIELD ? null : decode(value)
      if (state) states.set(id, state)
    }
    return states
  } catch (err) {
    logger.warn(`[Announcements] state cache read failed: ${String(err)}`)
    return null
  }
}

const writeRedis = async (
  userId: string,
  states: ReadonlyMap<string, UserAnnouncementState>,
  replace: boolean,
): Promise<void> => {
  const client = redis()
  if (!client) return
  const key = ANNOUNCEMENT_CACHE_KEYS.userState(userId)
  try {
    const pipeline = client.multi()
    if (replace) pipeline.del(key)
    pipeline.hset(key, USER_STATE_SENTINEL_FIELD, '1')
    for (const [id, state] of states) pipeline.hset(key, id, encode(state))
    pipeline.expire(key, resolveTtl(CACHE_TTL.ANNOUNCEMENTS.DISMISSED_SET))
    await pipeline.exec()
  } catch (err) {
    logger.warn(`[Announcements] state cache write failed: ${String(err)}`)
  }
}

const readDatabase = async (userId: string): Promise<UserStateMap> => {
  const rows = await prisma.announcementUserState.findMany({
    where: { userId },
    select: {
      announcementId: true,
      epoch: true,
      seenAt: true,
      dismissedAt: true,
    },
  })
  return new Map(
    rows.map((row) => [
      row.announcementId,
      {
        epoch: row.epoch,
        seen: row.seenAt !== null,
        dismissed: row.dismissedAt !== null,
      },
    ]),
  )
}

export const loadUserStates = async (userId: string): Promise<UserStateMap> => {
  const cached = await readRedis(userId)
  if (cached) return cached
  const states = await readDatabase(userId)
  await writeRedis(userId, states, true)
  return states
}

/** Mirrors states already committed to PostgreSQL into Redis (never the other way round). */
export const cacheUserStates = (
  userId: string,
  states: ReadonlyMap<string, UserAnnouncementState>,
): Promise<void> => writeRedis(userId, states, false)
