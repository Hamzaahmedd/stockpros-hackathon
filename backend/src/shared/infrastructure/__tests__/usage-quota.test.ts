jest.mock('../cache', () => ({
  getRawRedisClient: jest.fn(),
}))

import { getRawRedisClient } from '../cache'
import { incrementAndCheckQuota } from '../usage-quota'

const mockGetRawRedisClient = getRawRedisClient as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('incrementAndCheckQuota', () => {
  it('fails open when Redis is unavailable', async () => {
    mockGetRawRedisClient.mockReturnValue(null)

    const result = await incrementAndCheckQuota('news_ai', 'user-1', 5)

    expect(result).toEqual({ allowed: true, remaining: null, resetAt: null })
  })

  it('sets a TTL only on the first increment of the day', async () => {
    const redis = { incr: jest.fn().mockResolvedValue(1), expire: jest.fn() }
    mockGetRawRedisClient.mockReturnValue(redis)

    await incrementAndCheckQuota('news_ai', 'user-1', 5)

    expect(redis.expire).toHaveBeenCalledWith(
      expect.stringContaining('quota:news_ai:user-1:'),
      25 * 60 * 60,
    )
  })

  it('does not reset the TTL on subsequent increments', async () => {
    const redis = { incr: jest.fn().mockResolvedValue(2), expire: jest.fn() }
    mockGetRawRedisClient.mockReturnValue(redis)

    await incrementAndCheckQuota('news_ai', 'user-1', 5)

    expect(redis.expire).not.toHaveBeenCalled()
  })

  it('allows the request and reports remaining quota when under the limit', async () => {
    const redis = { incr: jest.fn().mockResolvedValue(3), expire: jest.fn() }
    mockGetRawRedisClient.mockReturnValue(redis)

    const result = await incrementAndCheckQuota('news_ai', 'user-1', 5)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
    expect(result.resetAt).toEqual(expect.any(String))
  })

  it('denies the request once the count exceeds the limit', async () => {
    const redis = { incr: jest.fn().mockResolvedValue(6), expire: jest.fn() }
    mockGetRawRedisClient.mockReturnValue(redis)

    const result = await incrementAndCheckQuota('news_ai', 'user-1', 5)

    expect(result).toMatchObject({ allowed: false, remaining: 0 })
  })

  it('denies the request exactly at the limit boundary (count === limit + 1)', async () => {
    const redis = { incr: jest.fn().mockResolvedValue(6), expire: jest.fn() }
    mockGetRawRedisClient.mockReturnValue(redis)

    const result = await incrementAndCheckQuota('news_ai', 'user-1', 5)

    expect(result.allowed).toBe(false)
  })

  it('still allows the request when the count exactly equals the limit', async () => {
    const redis = { incr: jest.fn().mockResolvedValue(5), expire: jest.fn() }
    mockGetRawRedisClient.mockReturnValue(redis)

    const result = await incrementAndCheckQuota('news_ai', 'user-1', 5)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it('resetAt reflects the next UTC midnight', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-06-15T10:00:00Z'))
    const redis = { incr: jest.fn().mockResolvedValue(1), expire: jest.fn() }
    mockGetRawRedisClient.mockReturnValue(redis)

    const result = await incrementAndCheckQuota('news_ai', 'user-1', 5)

    expect(result.resetAt).toBe('2024-06-16T00:00:00.000Z')
    jest.useRealTimers()
  })
})
