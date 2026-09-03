import { Options, Store, ClientRateLimitInfo } from 'express-rate-limit'
import type Redis from 'ioredis'

/**
 * Lua script to atomically enforce a sliding window rate limit using Redis Sorted Sets.
 *
 * KEYS[1] : The rate limit key (e.g., rl:global:127.0.0.1)
 * ARGV[1] : Current timestamp in milliseconds (now)
 * ARGV[2] : Window size in milliseconds (windowMs)
 * ARGV[3] : Max allowed requests (limit)
 * ARGV[4] : Unique identifier for this request (to ensure uniqueness in sorted set)
 *
 * Returns:
 * - totalHits: number of hits currently in the sliding window
 * - resetTimeMs: estimated timestamp when the oldest hit exits the window
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local memberId = ARGV[4]
local clearBefore = now - windowMs

-- 1. Remove timestamps that have slipped out of the sliding window
redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)

-- 2. Count remaining hits inside [now - windowMs, now]
local currentHits = redis.call('ZCARD', key)

-- 3. If within limit, record current timestamp
if currentHits < limit then
  redis.call('ZADD', key, now, memberId)
  redis.call('PEXPIRE', key, windowMs)
  currentHits = currentHits + 1
end

-- 4. Calculate when the oldest request in the window expires
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local resetTime = now + windowMs
if oldest and #oldest >= 2 then
  local oldestScore = tonumber(oldest[2])
  resetTime = oldestScore + windowMs
end

return { currentHits, resetTime }
`

export interface RedisSlidingWindowStoreOptions {
  client: Redis
  prefix?: string
}

let counter = 0

export class RedisSlidingWindowStore implements Store {
  private readonly client: Redis
  readonly prefix: string
  private windowMs: number = 60 * 1000
  private max: number = 60

  constructor(options: RedisSlidingWindowStoreOptions) {
    this.client = options.client
    this.prefix = options.prefix ?? 'rl:sw:'
  }

  init(options: Options): void {
    this.windowMs = options.windowMs
    this.max = typeof options.limit === 'number' ? options.limit : 60
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const fullKey = this.getKey(key)
    const now = Date.now()
    // Append a counter to now so multiple requests within the same millisecond don't overwrite each other
    counter = (counter + 1) % 1000000
    const memberId = `${now}:${counter}:${Math.random().toString(36).substring(2, 7)}`

    try {
      const result = (await this.client.eval(
        SLIDING_WINDOW_LUA,
        1,
        fullKey,
        now.toString(),
        this.windowMs.toString(),
        this.max.toString(),
        memberId,
      )) as [number, number]

      const [totalHits, resetTimeMs] = result

      return {
        totalHits: Number(totalHits),
        resetTime: new Date(Number(resetTimeMs)),
      }
    } catch {
      // If Redis fails during eval, return permissive fallback to avoid blocking users
      return {
        totalHits: 1,
        resetTime: new Date(now + this.windowMs),
      }
    }
  }

  async decrement(key: string): Promise<void> {
    const fullKey = this.getKey(key)
    try {
      // Remove the newest entry from the sorted set
      await this.client.zremrangebyrank(fullKey, -1, -1)
    } catch {
      // Silently catch errors on decrement
    }
  }

  async resetKey(key: string): Promise<void> {
    const fullKey = this.getKey(key)
    try {
      await this.client.del(fullKey)
    } catch {
      // Silently catch errors on delete
    }
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const fullKey = this.getKey(key)
    const now = Date.now()
    const clearBefore = now - this.windowMs

    try {
      await this.client.zremrangebyscore(fullKey, 0, clearBefore)
      const hits = await this.client.zcard(fullKey)
      const oldest = await this.client.zrange(fullKey, 0, 0, 'WITHSCORES')

      let resetTime = now + this.windowMs
      if (oldest && oldest.length >= 2) {
        resetTime = Number(oldest[1]) + this.windowMs
      }

      return {
        totalHits: hits,
        resetTime: new Date(resetTime),
      }
    } catch {
      return undefined
    }
  }
}
