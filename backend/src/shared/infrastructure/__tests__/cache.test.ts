jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    options: { host: 'localhost', port: 6379, password: 'secret' },
  }))
})

import Redis from 'ioredis'
import config from '@/config'
import {
  closeRedis,
  connectRedis,
  deleteCache,
  getCache,
  getRawRedisClient,
  getRedisClient,
  resolveTtl,
  setCache,
} from '../cache'

const MockRedis = Redis as unknown as jest.Mock

const originalRedisUrl = config.redis.url
const originalCacheEnabled = config.cache.enabled
const originalTtlMultiplier = config.cache.ttlMultiplier

beforeEach(async () => {
  jest.clearAllMocks()
  ;(config.redis as any).url = originalRedisUrl
  ;(config.cache as any).enabled = originalCacheEnabled
  ;(config.cache as any).ttlMultiplier = originalTtlMultiplier
  await closeRedis() // reset the module's internal client to null between tests
})

describe('connectRedis / closeRedis / getRawRedisClient', () => {
  it('does not construct a client when REDIS_URL is unset', async () => {
    ;(config.redis as any).url = ''
    await connectRedis()
    expect(MockRedis).not.toHaveBeenCalled()
    expect(getRawRedisClient()).toBeNull()
  })

  it('treats the literal string "undefined" the same as unset', async () => {
    ;(config.redis as any).url = 'undefined'
    await connectRedis()
    expect(MockRedis).not.toHaveBeenCalled()
  })

  it('connects and exposes the client once a valid URL is configured', async () => {
    ;(config.redis as any).url = 'redis://localhost:6379'
    await connectRedis()
    expect(MockRedis).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.any(Object),
    )
    expect(getRawRedisClient()).not.toBeNull()
  })

  it('registers error/end/ready event handlers that log without throwing', async () => {
    ;(config.redis as any).url = 'redis://localhost:6379'
    await connectRedis()
    const client = getRawRedisClient()! as unknown as { on: jest.Mock }

    const invoke = (event: string, ...args: unknown[]) => {
      const handler = client.on.mock.calls.find(
        (call) => call[0] === event,
      )?.[1]
      expect(handler).toBeDefined()
      handler(...args)
    }

    expect(() => invoke('error', new Error('boom'))).not.toThrow()
    expect(() =>
      invoke('error', 'a plain string error, not an Error instance'),
    ).not.toThrow()
    expect(() => invoke('end')).not.toThrow()
    expect(() => invoke('ready')).not.toThrow()
  })

  it('falls back to a disabled cache (null client) when the connection itself fails', async () => {
    ;(config.redis as any).url = 'redis://localhost:6379'
    MockRedis.mockImplementationOnce(() => ({
      on: jest.fn(),
      connect: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      disconnect: jest.fn().mockResolvedValue(undefined),
    }))

    await connectRedis()
    expect(getRawRedisClient()).toBeNull()
  })

  it('swallows a failure in the best-effort disconnect during a failed connection attempt', async () => {
    ;(config.redis as any).url = 'redis://localhost:6379'
    MockRedis.mockImplementationOnce(() => ({
      on: jest.fn(),
      connect: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      disconnect: jest.fn().mockRejectedValue(new Error('already closed')),
    }))

    await expect(connectRedis()).resolves.toBeUndefined()
    expect(getRawRedisClient()).toBeNull()
  })

  it('closeRedis is a no-op when there is no active client', async () => {
    await expect(closeRedis()).resolves.toBeUndefined()
  })

  it('closeRedis quits gracefully and clears the client', async () => {
    ;(config.redis as any).url = 'redis://localhost:6379'
    await connectRedis()
    const client = getRawRedisClient()!

    await closeRedis()
    expect(client.quit).toHaveBeenCalled()
    expect(getRawRedisClient()).toBeNull()
  })

  it('closeRedis still clears the client even when quit() rejects', async () => {
    ;(config.redis as any).url = 'redis://localhost:6379'
    await connectRedis()
    const client = getRawRedisClient()!
    ;(client.quit as jest.Mock).mockRejectedValue(new Error('quit failed'))

    await closeRedis()
    expect(getRawRedisClient()).toBeNull()
  })

  it('closeRedis logs cleanly even when quit() rejects with a non-Error value', async () => {
    ;(config.redis as any).url = 'redis://localhost:6379'
    await connectRedis()
    const client = getRawRedisClient()!
    ;(client.quit as jest.Mock).mockRejectedValue('connection already gone')

    await expect(closeRedis()).resolves.toBeUndefined()
  })

  it('logs cleanly when the connection attempt itself rejects with a non-Error value', async () => {
    ;(config.redis as any).url = 'redis://localhost:6379'
    MockRedis.mockImplementationOnce(() => ({
      on: jest.fn(),
      connect: jest.fn().mockRejectedValue('ECONNREFUSED as a bare string'),
      disconnect: jest.fn().mockResolvedValue(undefined),
    }))

    await expect(connectRedis()).resolves.toBeUndefined()
    expect(getRawRedisClient()).toBeNull()
  })
})

describe('getRedisClient', () => {
  it('derives connection options from the live client when connected', async () => {
    ;(config.redis as any).url = 'redis://localhost:6379'
    await connectRedis()

    expect(getRedisClient()).toEqual({
      host: 'localhost',
      port: 6379,
      password: 'secret',
    })
  })

  it('parses REDIS_URL directly when there is no live client yet', () => {
    ;(config.redis as any).url = 'redis://:mypassword@cache.example.com:6380'
    expect(getRedisClient()).toEqual({
      host: 'cache.example.com',
      port: 6380,
      password: 'mypassword',
    })
  })

  it('defaults the port to 6379 when the URL omits one', () => {
    ;(config.redis as any).url = 'redis://cache.example.com'
    expect(getRedisClient()?.port).toBe(6379)
  })

  it('returns undefined when there is no client and no configured URL', () => {
    ;(config.redis as any).url = ''
    expect(getRedisClient()).toBeUndefined()
  })

  it('returns undefined and logs when REDIS_URL is malformed', () => {
    ;(config.redis as any).url = 'not a valid url::::'
    expect(getRedisClient()).toBeUndefined()
  })
})

describe('resolveTtl', () => {
  it('applies the configured multiplier and rounds to the nearest second', () => {
    ;(config.cache as any).ttlMultiplier = 0.5
    expect(resolveTtl(101)).toBe(51) // 50.5 rounds to 51
  })

  it('defaults the multiplier to 1.0 when unset', () => {
    ;(config.cache as any).ttlMultiplier = undefined
    expect(resolveTtl(60)).toBe(60)
  })

  it('never returns a negative TTL', () => {
    ;(config.cache as any).ttlMultiplier = -1
    expect(resolveTtl(60)).toBe(0)
  })
})

describe('getCache / setCache / deleteCache', () => {
  const connectWithClient = async () => {
    ;(config.redis as any).url = 'redis://localhost:6379'
    await connectRedis()
    return getRawRedisClient()!
  }

  it('getCache returns null without touching Redis when there is no client', async () => {
    ;(config.cache as any).enabled = true
    expect(await getCache('key')).toBeNull()
  })

  it('getCache returns null when caching is disabled even with a live client', async () => {
    const client = await connectWithClient()
    ;(config.cache as any).enabled = false
    expect(await getCache('key')).toBeNull()
    expect(client.get).not.toHaveBeenCalled()
  })

  it('getCache returns null on a cache miss', async () => {
    const client = await connectWithClient()
    ;(config.cache as any).enabled = true
    ;(client.get as jest.Mock).mockResolvedValue(null)
    expect(await getCache('key')).toBeNull()
  })

  it('getCache parses a JSON value', async () => {
    const client = await connectWithClient()
    ;(config.cache as any).enabled = true
    ;(client.get as jest.Mock).mockResolvedValue('{"a":1}')
    expect(await getCache('key')).toEqual({ a: 1 })
  })

  it('getCache returns a non-JSON string as-is', async () => {
    const client = await connectWithClient()
    ;(config.cache as any).enabled = true
    ;(client.get as jest.Mock).mockResolvedValue('plain-string')
    expect(await getCache('key')).toBe('plain-string')
  })

  it('getCache returns null and logs when Redis itself errors', async () => {
    const client = await connectWithClient()
    ;(config.cache as any).enabled = true
    ;(client.get as jest.Mock).mockRejectedValue(new Error('connection reset'))
    expect(await getCache('key')).toBeNull()
  })

  it('setCache is a no-op without a live client or when caching is disabled', async () => {
    ;(config.cache as any).enabled = true
    await expect(setCache('key', { a: 1 })).resolves.toBeUndefined()

    const client = await connectWithClient()
    ;(config.cache as any).enabled = false
    await setCache('key', { a: 1 })
    expect(client.set).not.toHaveBeenCalled()
  })

  it('setCache serializes an object and stores it without expiry when no TTL is given', async () => {
    const client = await connectWithClient()
    ;(config.cache as any).enabled = true
    await setCache('key', { a: 1 })
    expect(client.set).toHaveBeenCalledWith('key', '{"a":1}')
  })

  it('setCache stores a raw string without double-JSON-encoding it', async () => {
    const client = await connectWithClient()
    ;(config.cache as any).enabled = true
    ;(config.cache as any).ttlMultiplier = 1 // test env defaults this to 0 (see resolveTtl)
    await setCache('key', 'raw-value', 60)
    expect(client.set).toHaveBeenCalledWith('key', 'raw-value', 'EX', 60)
  })

  it('setCache skips the write entirely when the resolved TTL is zero (e.g. ttlMultiplier=0)', async () => {
    const client = await connectWithClient()
    ;(config.cache as any).enabled = true
    ;(config.cache as any).ttlMultiplier = 0
    await setCache('key', { a: 1 }, 60)
    expect(client.set).not.toHaveBeenCalled()
  })

  it('setCache logs and swallows a Redis write failure', async () => {
    const client = await connectWithClient()
    ;(config.cache as any).enabled = true
    ;(client.set as jest.Mock).mockRejectedValue(new Error('write failed'))
    await expect(setCache('key', { a: 1 })).resolves.toBeUndefined()
  })

  it('deleteCache is a no-op without a live client', async () => {
    await expect(deleteCache('key')).resolves.toBeUndefined()
  })

  it('deleteCache removes the key', async () => {
    const client = await connectWithClient()
    await deleteCache('key')
    expect(client.del).toHaveBeenCalledWith('key')
  })

  it('deleteCache logs and swallows a Redis delete failure', async () => {
    const client = await connectWithClient()
    ;(client.del as jest.Mock).mockRejectedValue(new Error('delete failed'))
    await expect(deleteCache('key')).resolves.toBeUndefined()
  })
})
