jest.mock('../logger', () => ({ logger: { warn: jest.fn() } }))

const mockRedis = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
}
let mockClient: typeof mockRedis | null = null
jest.mock('../cache', () => ({ getRawRedisClient: () => mockClient }))

import config from '@/config'
import { claimAlertSlot } from '../alert-throttle'
import { logger } from '../logger'

const WINDOW = 600

beforeEach(() => {
  jest.clearAllMocks()
  mockClient = null
  config.cache.enabled = true
})

describe('without Redis (per-process)', () => {
  it('sends the first alert of a window and holds back the rest', async () => {
    const t0 = 1_000_000
    expect(await claimAlertSlot('mem:a', WINDOW, t0)).toEqual({
      send: true,
      suppressed: 0,
    })
    expect(await claimAlertSlot('mem:a', WINDOW, t0 + 1_000)).toEqual({
      send: false,
      suppressed: 1,
    })
    expect(await claimAlertSlot('mem:a', WINDOW, t0 + 2_000)).toEqual({
      send: false,
      suppressed: 2,
    })
  })

  it('reports what was held back with the next alert after the window', async () => {
    const t0 = 2_000_000
    await claimAlertSlot('mem:b', WINDOW, t0)
    await claimAlertSlot('mem:b', WINDOW, t0 + 1)
    await claimAlertSlot('mem:b', WINDOW, t0 + 2)

    const next = await claimAlertSlot('mem:b', WINDOW, t0 + WINDOW * 1000 + 1)

    expect(next).toEqual({ send: true, suppressed: 2 })
    // And the counter starts again.
    expect(
      await claimAlertSlot('mem:b', WINDOW, t0 + WINDOW * 1000 + 2),
    ).toEqual({ send: false, suppressed: 1 })
  })

  it('keeps scopes independent', async () => {
    const t0 = 3_000_000
    expect((await claimAlertSlot('mem:c1', WINDOW, t0)).send).toBe(true)
    expect((await claimAlertSlot('mem:c2', WINDOW, t0)).send).toBe(true)
    expect((await claimAlertSlot('mem:c1', WINDOW, t0 + 1)).send).toBe(false)
  })

  it('forgets old quiet scopes so the map cannot grow without bound', async () => {
    const t0 = 4_000_000
    for (let i = 0; i < 520; i += 1) {
      await claimAlertSlot(`mem:prune-${i}`, 1, t0)
    }
    // Long after every window, a new scope triggers a prune and still works.
    expect((await claimAlertSlot('mem:prune-new', 1, t0 + 60_000)).send).toBe(
      true,
    )
    expect((await claimAlertSlot('mem:prune-0', 1, t0 + 60_001)).send).toBe(
      true,
    )
  })

  it('is used when caching is switched off, even with a client', async () => {
    mockClient = mockRedis
    config.cache.enabled = false
    expect((await claimAlertSlot('mem:off', WINDOW, 5_000_000)).send).toBe(true)
    expect(mockRedis.set).not.toHaveBeenCalled()
  })
})

describe('with Redis (shared across instances)', () => {
  beforeEach(() => {
    mockClient = mockRedis
  })

  it('claims the slot atomically with a window-long expiry', async () => {
    mockRedis.set.mockResolvedValue('OK')
    mockRedis.get.mockResolvedValue(null)

    expect(await claimAlertSlot('JOB_FAILED:queue-a', WINDOW)).toEqual({
      send: true,
      suppressed: 0,
    })
    expect(mockRedis.set).toHaveBeenCalledWith(
      'opsalert:slot:JOB_FAILED:queue-a',
      '1',
      'EX',
      WINDOW,
      'NX',
    )
    expect(mockRedis.del).not.toHaveBeenCalled()
  })

  it('reports and clears the held-back count when a new window starts', async () => {
    mockRedis.set.mockResolvedValue('OK')
    mockRedis.get.mockResolvedValue('7')

    expect(await claimAlertSlot('JOB_FAILED:queue-a', WINDOW)).toEqual({
      send: true,
      suppressed: 7,
    })
    expect(mockRedis.get).toHaveBeenCalledWith(
      'opsalert:count:JOB_FAILED:queue-a',
    )
    expect(mockRedis.del).toHaveBeenCalledWith(
      'opsalert:count:JOB_FAILED:queue-a',
    )
  })

  it('counts an alert it holds back, and expires the counter after the first', async () => {
    mockRedis.set.mockResolvedValue(null)
    mockRedis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2)

    expect(await claimAlertSlot('k', WINDOW)).toEqual({
      send: false,
      suppressed: 1,
    })
    expect(mockRedis.expire).toHaveBeenCalledWith(
      'opsalert:count:k',
      WINDOW * 2,
    )

    expect(await claimAlertSlot('k', WINDOW)).toEqual({
      send: false,
      suppressed: 2,
    })
    expect(mockRedis.expire).toHaveBeenCalledTimes(1)
  })

  it('falls back to the per-process window when Redis fails, and says so', async () => {
    mockRedis.set.mockRejectedValue(new Error('redis down'))

    expect((await claimAlertSlot('fail:a', WINDOW, 6_000_000)).send).toBe(true)
    expect((await claimAlertSlot('fail:a', WINDOW, 6_000_001)).send).toBe(false)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('throttle store failed'),
    )
  })
})
