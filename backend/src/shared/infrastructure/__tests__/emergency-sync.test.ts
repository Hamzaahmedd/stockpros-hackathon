const mockRedis = { get: jest.fn(), set: jest.fn() }
let mockClient: typeof mockRedis | null = mockRedis

jest.mock('../cache', () => ({
  getRawRedisClient: () => mockClient,
}))

const mockWarn = jest.fn()
jest.mock('../logger', () => ({
  logger: { warn: (...args: unknown[]) => mockWarn(...args) },
}))

const mockSetEmergencyClosed = jest.fn()
jest.mock('../../utils/market-hours', () => ({
  setEmergencyClosed: (...args: unknown[]) => mockSetEmergencyClosed(...args),
}))

import {
  EMERGENCY_STATE_KEY,
  EMERGENCY_SYNC_INTERVAL_MS,
  persistEmergencyClosed,
  reconcileEmergencyClosed,
  startEmergencySync,
  stopEmergencySync,
} from '../emergency-sync'

beforeEach(() => {
  jest.clearAllMocks()
  mockClient = mockRedis
  mockRedis.get.mockResolvedValue(null)
  mockRedis.set.mockResolvedValue('OK')
})

describe('persistEmergencyClosed', () => {
  it('stores 1 for a halt and 0 for a clear so other instances can converge', async () => {
    await expect(persistEmergencyClosed(true)).resolves.toBe(true)
    expect(mockRedis.set).toHaveBeenLastCalledWith(EMERGENCY_STATE_KEY, '1')
    await expect(persistEmergencyClosed(false)).resolves.toBe(true)
    expect(mockRedis.set).toHaveBeenLastCalledWith(EMERGENCY_STATE_KEY, '0')
  })

  it('reports false (and warns) when Redis is not connected', async () => {
    mockClient = null
    await expect(persistEmergencyClosed(true)).resolves.toBe(false)
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('this instance only'),
    )
  })

  it('reports false instead of throwing when Redis errors', async () => {
    mockRedis.set.mockRejectedValue(new Error('boom'))
    await expect(persistEmergencyClosed(true)).resolves.toBe(false)
    expect(mockWarn).toHaveBeenCalled()
  })
})

describe('reconcileEmergencyClosed', () => {
  it.each([
    ['1', true],
    ['0', false],
  ])('applies the shared value %s locally', async (stored, expected) => {
    mockRedis.get.mockResolvedValue(stored)
    await reconcileEmergencyClosed()
    expect(mockSetEmergencyClosed).toHaveBeenCalledWith(expected)
  })

  it('leaves the env-seeded value alone when nothing is stored', async () => {
    await reconcileEmergencyClosed()
    expect(mockSetEmergencyClosed).not.toHaveBeenCalled()
  })

  it('does nothing without Redis and survives read errors', async () => {
    mockClient = null
    await reconcileEmergencyClosed()
    expect(mockSetEmergencyClosed).not.toHaveBeenCalled()

    mockClient = mockRedis
    mockRedis.get.mockRejectedValue(new Error('boom'))
    await expect(reconcileEmergencyClosed()).resolves.toBeUndefined()
    expect(mockWarn).toHaveBeenCalled()
  })
})

describe('start/stopEmergencySync', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    stopEmergencySync()
    jest.useRealTimers()
  })

  it('reconciles immediately, then on every interval, and only starts once', async () => {
    mockRedis.get.mockResolvedValue('1')
    startEmergencySync()
    startEmergencySync()
    await jest.advanceTimersByTimeAsync(0)
    expect(mockRedis.get).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(EMERGENCY_SYNC_INTERVAL_MS)
    expect(mockRedis.get).toHaveBeenCalledTimes(2)
  })

  it('stops polling and tolerates being stopped twice', async () => {
    startEmergencySync()
    await jest.advanceTimersByTimeAsync(0)
    stopEmergencySync()
    stopEmergencySync()
    mockRedis.get.mockClear()

    await jest.advanceTimersByTimeAsync(EMERGENCY_SYNC_INTERVAL_MS * 3)
    expect(mockRedis.get).not.toHaveBeenCalled()
  })
})
