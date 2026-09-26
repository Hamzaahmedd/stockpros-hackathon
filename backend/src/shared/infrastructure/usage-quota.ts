import { getRawRedisClient } from './cache'

export interface QuotaCheckResult {
  allowed: boolean
  remaining: number | null
  resetAt: string | null
}

const KEY_TTL_SECONDS = 25 * 60 * 60 // 25h — covers clock/timezone drift around the UTC day boundary

function nextUtcMidnightISOString(): string {
  const now = new Date()
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  )
  return next.toISOString()
}

/**
 * Increments a per-user, per-feature, per-calendar-day counter in Redis and
 * reports whether the caller is still within `limit`. Fails open (allows the
 * request) when Redis is unavailable, matching this app's existing
 * fail-open convention for optional infrastructure.
 */
export async function incrementAndCheckQuota(
  feature: string,
  userId: string,
  limit: number,
): Promise<QuotaCheckResult> {
  const redis = getRawRedisClient()
  if (!redis) return { allowed: true, remaining: null, resetAt: null }

  const day = new Date().toISOString().slice(0, 10)
  const key = `quota:${feature}:${userId}:${day}`

  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, KEY_TTL_SECONDS)
  }

  const resetAt = nextUtcMidnightISOString()
  if (count > limit) {
    return { allowed: false, remaining: 0, resetAt }
  }
  return { allowed: true, remaining: limit - count, resetAt }
}
