import { RedisSlidingWindowStore } from '../redis-sliding-window-store'

const mockClient = () => ({
  eval: jest.fn(),
  zremrangebyrank: jest.fn(),
  del: jest.fn(),
  zremrangebyscore: jest.fn(),
  zcard: jest.fn(),
  zrange: jest.fn(),
})

describe('RedisSlidingWindowStore — construction', () => {
  it('defaults the key prefix to rl:sw: when none is given', () => {
    const store = new RedisSlidingWindowStore({ client: mockClient() as any })
    expect(store.prefix).toBe('rl:sw:')
  })

  it('honors a custom key prefix', () => {
    const store = new RedisSlidingWindowStore({
      client: mockClient() as any,
      prefix: 'rl:otp:',
    })
    expect(store.prefix).toBe('rl:otp:')
  })
})

describe('RedisSlidingWindowStore — init', () => {
  it('adopts the windowMs and limit from express-rate-limit options', async () => {
    const client = mockClient()
    const store = new RedisSlidingWindowStore({ client: client as any })
    store.init({ windowMs: 5000, limit: 3 } as any)
    client.eval.mockResolvedValue([1, Date.now() + 5000])

    await store.increment('user-1')
    expect(client.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'rl:sw:user-1',
      expect.any(String),
      '5000',
      '3',
      expect.any(String),
    )
  })

  it('defaults the limit to 60 when options.limit is not a number', async () => {
    const client = mockClient()
    const store = new RedisSlidingWindowStore({ client: client as any })
    store.init({ windowMs: 5000, limit: undefined } as any)
    client.eval.mockResolvedValue([1, Date.now() + 5000])

    await store.increment('user-1')
    expect(client.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'rl:sw:user-1',
      expect.any(String),
      '5000',
      '60',
      expect.any(String),
    )
  })
})

describe('RedisSlidingWindowStore — increment', () => {
  it('parses totalHits and resetTime from the Lua script result', async () => {
    const client = mockClient()
    const store = new RedisSlidingWindowStore({ client: client as any })
    store.init({ windowMs: 60_000, limit: 10 } as any)
    const resetTimeMs = Date.now() + 30_000
    client.eval.mockResolvedValue([4, resetTimeMs])

    const result = await store.increment('1.2.3.4')
    expect(result).toEqual({ totalHits: 4, resetTime: new Date(resetTimeMs) })
  })

  it('gives every request a unique member id, even within the same millisecond', async () => {
    const client = mockClient()
    const store = new RedisSlidingWindowStore({ client: client as any })
    store.init({ windowMs: 60_000, limit: 10 } as any)
    client.eval.mockResolvedValue([1, Date.now()])

    await store.increment('key')
    await store.increment('key')

    const [firstMemberId] = client.eval.mock.calls[0].slice(-1)
    const [secondMemberId] = client.eval.mock.calls[1].slice(-1)
    expect(firstMemberId).not.toBe(secondMemberId)
  })

  it('returns a permissive fallback (does not block the request) when Redis eval fails', async () => {
    const client = mockClient()
    const store = new RedisSlidingWindowStore({ client: client as any })
    store.init({ windowMs: 60_000, limit: 10 } as any)
    client.eval.mockRejectedValue(new Error('redis down'))

    const before = Date.now()
    const result = await store.increment('key')
    expect(result.totalHits).toBe(1)
    expect(result.resetTime!.getTime()).toBeGreaterThanOrEqual(before + 60_000)
  })
})

describe('RedisSlidingWindowStore — decrement', () => {
  it('removes the newest entry from the sorted set', async () => {
    const client = mockClient()
    const store = new RedisSlidingWindowStore({ client: client as any })
    await store.decrement('key')
    expect(client.zremrangebyrank).toHaveBeenCalledWith('rl:sw:key', -1, -1)
  })

  it('silently swallows a Redis failure', async () => {
    const client = mockClient()
    client.zremrangebyrank.mockRejectedValue(new Error('redis down'))
    const store = new RedisSlidingWindowStore({ client: client as any })
    await expect(store.decrement('key')).resolves.toBeUndefined()
  })
})

describe('RedisSlidingWindowStore — resetKey', () => {
  it('deletes the underlying key', async () => {
    const client = mockClient()
    const store = new RedisSlidingWindowStore({ client: client as any })
    await store.resetKey('key')
    expect(client.del).toHaveBeenCalledWith('rl:sw:key')
  })

  it('silently swallows a Redis failure', async () => {
    const client = mockClient()
    client.del.mockRejectedValue(new Error('redis down'))
    const store = new RedisSlidingWindowStore({ client: client as any })
    await expect(store.resetKey('key')).resolves.toBeUndefined()
  })
})

describe('RedisSlidingWindowStore — get', () => {
  it('computes resetTime from the oldest entry in the window', async () => {
    const client = mockClient()
    const store = new RedisSlidingWindowStore({ client: client as any })
    store.init({ windowMs: 60_000, limit: 10 } as any)
    client.zcard.mockResolvedValue(3)
    const oldestScore = Date.now() - 10_000
    client.zrange.mockResolvedValue(['member-id', String(oldestScore)])

    const result = await store.get('key')
    expect(result).toEqual({
      totalHits: 3,
      resetTime: new Date(oldestScore + 60_000),
    })
  })

  it('falls back to now + windowMs when the window is empty', async () => {
    const client = mockClient()
    const store = new RedisSlidingWindowStore({ client: client as any })
    store.init({ windowMs: 60_000, limit: 10 } as any)
    client.zcard.mockResolvedValue(0)
    client.zrange.mockResolvedValue([])

    const before = Date.now()
    const result = await store.get('key')
    expect(result!.totalHits).toBe(0)
    expect(result!.resetTime!.getTime()).toBeGreaterThanOrEqual(before + 60_000)
  })

  it('returns undefined when Redis fails', async () => {
    const client = mockClient()
    client.zremrangebyscore.mockRejectedValue(new Error('redis down'))
    const store = new RedisSlidingWindowStore({ client: client as any })
    expect(await store.get('key')).toBeUndefined()
  })
})
