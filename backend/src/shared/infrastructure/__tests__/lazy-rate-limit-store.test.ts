let mockClient: object | null = null
jest.mock('../cache', () => ({ getRawRedisClient: () => mockClient }))

const mockWarn = jest.fn()
jest.mock('../logger', () => ({
  logger: { warn: (...args: unknown[]) => mockWarn(...args) },
}))

const redisStores: { client: unknown; prefix: string; init: jest.Mock }[] = []
const mockRedisIncrement = jest.fn()
jest.mock('../redis-sliding-window-store', () => ({
  RedisSlidingWindowStore: jest.fn().mockImplementation((opts) => {
    const store = {
      ...opts,
      init: jest.fn(),
      increment: mockRedisIncrement,
      decrement: jest.fn().mockResolvedValue(undefined),
      resetKey: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({ totalHits: 7 }),
    }
    redisStores.push(store)
    return store
  }),
}))

import {
  LazyRateLimitStore,
  resetMemoryFallbackWarning,
} from '../lazy-rate-limit-store'

const OPTIONS = { windowMs: 60_000, limit: 5 } as never

beforeEach(() => {
  jest.clearAllMocks()
  redisStores.length = 0
  mockClient = null
  resetMemoryFallbackWarning()
  mockRedisIncrement.mockResolvedValue({ totalHits: 3, resetTime: new Date() })
})

describe('LazyRateLimitStore', () => {
  it('counts in memory while Redis is unavailable and warns once', async () => {
    const store = new LazyRateLimitStore('rl:test:')
    store.init(OPTIONS)

    expect((await store.increment('ip')).totalHits).toBe(1)
    expect((await store.increment('ip')).totalHits).toBe(2)
    expect(mockRedisIncrement).not.toHaveBeenCalled()
    expect(mockWarn).toHaveBeenCalledTimes(1)
  })

  it('switches to Redis once it connects after the store was created', async () => {
    const store = new LazyRateLimitStore('rl:test:')
    store.init(OPTIONS)
    await store.increment('ip')

    mockClient = { id: 'redis-1' }
    const result = await store.increment('ip')

    expect(result.totalHits).toBe(3)
    expect(redisStores).toHaveLength(1)
    expect(redisStores[0]).toMatchObject({
      prefix: 'rl:test:',
      client: mockClient,
    })
    expect(redisStores[0].init).toHaveBeenCalledWith(OPTIONS)
  })

  it('reuses one Redis store per client and rebuilds it for a new client', async () => {
    mockClient = { id: 'redis-1' }
    const store = new LazyRateLimitStore('rl:test:')
    await store.increment('a')
    await store.increment('b')
    expect(redisStores).toHaveLength(1)

    mockClient = { id: 'redis-2' }
    await store.increment('c')
    expect(redisStores).toHaveLength(2)
  })

  it('initialises a Redis store created before init() once options arrive', async () => {
    mockClient = { id: 'redis-1' }
    const store = new LazyRateLimitStore('rl:test:')
    await store.increment('a')
    expect(redisStores[0].init).not.toHaveBeenCalled()

    store.init(OPTIONS)
    expect(redisStores[0].init).toHaveBeenCalledWith(OPTIONS)
  })

  it('delegates decrement, resetKey and get to the active store', async () => {
    const store = new LazyRateLimitStore('rl:test:')
    store.init(OPTIONS)
    await store.increment('k')
    await store.decrement('k')
    await store.resetKey('k')
    expect(await store.get('k')).toBeUndefined()

    mockClient = { id: 'redis-1' }
    await store.decrement('k')
    await store.resetKey('k')
    expect(await store.get('k')).toEqual({ totalHits: 7 })
    expect(redisStores[0]).toBeDefined()
  })
})
