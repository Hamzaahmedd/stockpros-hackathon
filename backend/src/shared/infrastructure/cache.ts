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

/**
 * Lightweight liveness probe used by the public health endpoint.
 *
 * Returns `null` when Redis is not configured or not connected (the
 * probe is skipped — the app intentionally runs without cache), and
 * `true`/`false` for reachable/unreachable otherwise.
 */
export async function pingRedis(): Promise<boolean | null> {
  if (!redisClient) return null
  try {
    return (await redisClient.ping()) === 'PONG'
  } catch {
    return false
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

export async function getCache<T = unknown>(key: string): Promise<T | null> {
  if (!redisClient) return null
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
  if (!redisClient) return
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    if (ttlSeconds) {
      // Domain TTLs (shared/constants/cache-constants.ts) are scaled by the
      // environment-wide multiplier here, in one place. The test config sets
      // it to 0, which skips expiring writes entirely so suites never wait
      // on delayed cache expiration.
      const effectiveTtl = Math.floor(ttlSeconds * config.cache.ttlMultiplier)
      if (effectiveTtl <= 0) return
      await redisClient.set(key, serialized, 'EX', effectiveTtl)
    } else {
      await redisClient.set(key, serialized)
    }
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
