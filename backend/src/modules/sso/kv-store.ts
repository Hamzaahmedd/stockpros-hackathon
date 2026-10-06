import { getRawRedisClient } from '../../shared/infrastructure/cache'
import { ServiceUnavailableError } from '../../shared/errors'
import config from '@/config'

/**
 * Short-lived single-use values (login state, exchange codes, request ids).
 * Redis when connected so every API instance sees the same keys; an in-process
 * map elsewhere, which is only correct for a single instance and is therefore
 * refused in production.
 */
export interface KeyValueStore {
  set(key: string, value: string, ttlMs: number): Promise<void>
  /** Stores only if the key is free; false means it already existed. */
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>
  get(key: string): Promise<string | null>
  /** Atomically reads and deletes, so a value can be used once. */
  take(key: string): Promise<string | null>
}

const PREFIX = 'sso:'

const memory = new Map<string, { value: string; expiresAt: number }>()

const readMemory = (key: string): string | null => {
  const entry = memory.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key)
    return null
  }
  return entry.value
}

const memoryStore: KeyValueStore = {
  set: async (key, value, ttlMs) => {
    memory.set(key, { value, expiresAt: Date.now() + ttlMs })
  },
  setIfAbsent: async (key, value, ttlMs) => {
    if (readMemory(key) !== null) return false
    memory.set(key, { value, expiresAt: Date.now() + ttlMs })
    return true
  },
  get: async (key) => readMemory(key),
  take: async (key) => {
    const value = readMemory(key)
    memory.delete(key)
    return value
  },
}

const redisStore = (
  redis: NonNullable<ReturnType<typeof getRawRedisClient>>,
): KeyValueStore => ({
  set: async (key, value, ttlMs) => {
    await redis.set(PREFIX + key, value, 'PX', ttlMs)
  },
  setIfAbsent: async (key, value, ttlMs) =>
    (await redis.set(PREFIX + key, value, 'PX', ttlMs, 'NX')) === 'OK',
  get: (key) => redis.get(PREFIX + key),
  take: async (key) => {
    const result = await redis
      .multi()
      .get(PREFIX + key)
      .del(PREFIX + key)
      .exec()
    const value = result?.[0]?.[1]
    return typeof value === 'string' ? value : null
  },
})

export const getKeyValueStore = (): KeyValueStore => {
  const redis = getRawRedisClient()
  if (redis) return redisStore(redis)
  if (config.server.nodeEnv === 'production') {
    throw new ServiceUnavailableError('SSO is temporarily unavailable')
  }
  return memoryStore
}
