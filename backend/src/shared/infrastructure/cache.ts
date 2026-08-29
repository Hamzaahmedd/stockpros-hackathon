import config from '@/config'
import Redis from 'ioredis'
import { finalOpts } from './config/redis'
import { logger } from './logger'

export interface RedisConnectionOptions {
  host?: string
  port?: number
  password?: string
}

let redisClient: Redis | null = null

export async function connectRedis(): Promise<void> {
  const redisUrl = config.redis.url

  if (!redisUrl || redisUrl.trim() === '' || redisUrl === 'undefined') {
    logger.info('No valid REDIS_URL found — Redis caching is disabled.')
    return
  }

  try {
    redisClient = new Redis(redisUrl, finalOpts)

    redisClient.on('error', (err) => logger.error('Redis error', err?.message || err))
    redisClient.on('end', () => logger.warn('Redis: connection closed'))
    redisClient.on('ready', () => logger.info('Redis connected successfully.'))

    await redisClient.connect()
  } catch (err) {
    logger.error(
      'Redis initialization failed (app will continue without cache)',
      err instanceof Error ? err.message : err,
    )
    if (redisClient) {
      try {
        await redisClient.disconnect()
      } catch {
        // best-effort disconnect
      }
    }
    redisClient = null
  }
}

export async function closeRedis(): Promise<void> {
  if (!redisClient) return
  try {
    await redisClient.quit()
    logger.info('Redis connection closed gracefully.')
  } catch (err) {
    logger.warn(`Redis close error: ${(err as Error)?.message || err}`)
  } finally {
    redisClient = null
  }
}

export function getRedisClient(): RedisConnectionOptions | undefined {
  if (redisClient) {
    return {
      host: redisClient.options.host?.toString(),
      port: redisClient.options.port,
      password: redisClient.options.password,
    }
  }

  const redisUrl = config.redis.url
  if (redisUrl && redisUrl !== '' && redisUrl !== 'undefined') {
    try {
      const parsed = new URL(redisUrl)
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379', 10),
        password: decodeURIComponent(parsed.password) || undefined,
      }
    } catch (err) {
      logger.error('[Redis] Invalid REDIS_URL format', err instanceof Error ? err.message : err)
      return undefined
    }
  }

  return undefined
}

/**
 * Resolves a domain TTL against the global environment TTL multiplier.
 */
export function resolveTtl(baseTtlSeconds: number): number {
  const multiplier = config.cache?.ttlMultiplier ?? 1.0
  return Math.max(0, Math.round(baseTtlSeconds * multiplier))
}

export async function getCache<T = unknown>(key: string): Promise<T | null> {
  if (!redisClient || !config.cache.enabled) return null
  try {
    const data = await redisClient.get(key)
    if (!data) return null
    try {
      return JSON.parse(data) as T
    } catch {
      return data as unknown as T
    }
  } catch (err) {
    logger.warn(`Redis getCache error [${key}]: ${String(err)}`)
    return null
  }
}

export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  if (!redisClient || !config.cache.enabled) return
  try {
    const effectiveTtl =
      ttlSeconds !== undefined ? resolveTtl(ttlSeconds) : undefined

    // If TTL resolves to 0 or negative (e.g. in test env with ttlMultiplier = 0), skip writing
    if (effectiveTtl !== undefined && effectiveTtl <= 0) {
      return
    }

    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    if (effectiveTtl) await redisClient.set(key, serialized, 'EX', effectiveTtl)
    else await redisClient.set(key, serialized)
  } catch (err) {
    logger.warn(`Redis setCache error [${key}]: ${String(err)}`)
  }
}

export async function deleteCache(key: string): Promise<void> {
  if (!redisClient) return
  try {
    await redisClient.del(key)
  } catch (err) {
    logger.warn(`Redis deleteCache error [${key}]: ${String(err)}`)
  }
}
