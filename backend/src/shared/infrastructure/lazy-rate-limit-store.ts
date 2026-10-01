import type Redis from 'ioredis'
import {
  ClientRateLimitInfo,
  MemoryStore,
  Options,
  Store,
} from 'express-rate-limit'
import { getRawRedisClient } from './cache'
import { logger } from './logger'
import { RedisSlidingWindowStore } from './redis-sliding-window-store'

let warnedAboutMemoryFallback = false

/**
 * A rate-limit store that chooses Redis or memory on every call, not once at
 * import. The limiters are module-level constants created before
 * `connectRedis()` runs, so a store picked at import time would be in-memory
 * forever and each instance would count requests separately. Choosing per call
 * means the limiter uses Redis as soon as it is connected and degrades to
 * memory if it is not.
 */
export class LazyRateLimitStore implements Store {
  readonly localKeys = false
  private options?: Options
  private readonly memory = new MemoryStore()
  private redis?: { client: Redis; store: RedisSlidingWindowStore }

  constructor(readonly prefix: string) {}

  init(options: Options): void {
    this.options = options
    this.memory.init(options)
    this.redis?.store.init(options)
  }

  private resolve(): Store {
    const client = getRawRedisClient()
    if (!client) {
      if (!warnedAboutMemoryFallback) {
        warnedAboutMemoryFallback = true
        logger.warn(
          '[RateLimit] Redis unavailable: limits are counted per instance until it connects',
        )
      }
      return this.memory
    }
    if (this.redis?.client !== client) {
      const store = new RedisSlidingWindowStore({
        client,
        prefix: this.prefix,
      })
      if (this.options) store.init(this.options)
      this.redis = { client, store }
    }
    return this.redis.store
  }

  increment(key: string): Promise<ClientRateLimitInfo> {
    return Promise.resolve(this.resolve().increment(key))
  }

  async decrement(key: string): Promise<void> {
    await this.resolve().decrement(key)
  }

  async resetKey(key: string): Promise<void> {
    await this.resolve().resetKey(key)
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    return this.resolve().get?.(key)
  }
}

/** Test seam: lets the one-time fallback warning be asserted more than once. */
export const resetMemoryFallbackWarning = (): void => {
  warnedAboutMemoryFallback = false
}
