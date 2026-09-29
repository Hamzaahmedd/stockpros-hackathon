jest.mock('../../../../shared/infrastructure/database', () => ({
  prisma: { watchlistAlert: { findMany: jest.fn() } },
}))

import { prisma } from '../../../../shared/infrastructure/database'
import {
  getActiveAlertsForSymbol,
  getAlertCacheStats,
  invalidateAlertCache,
} from '../alert-rule-cache'

const mockFindMany = prisma.watchlistAlert.findMany as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('getActiveAlertsForSymbol', () => {
  it('fetches from the DB and caches the result on a cache miss', async () => {
    mockFindMany.mockResolvedValue([{ id: 'a1' }])

    const result = await getActiveAlertsForSymbol('AAPL')

    expect(result).toEqual([{ id: 'a1' }])
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { isActive: true, watchlist: { symbol: 'AAPL' } },
    })
  })

  it('returns the cached value on a subsequent call without hitting the DB again', async () => {
    mockFindMany.mockResolvedValue([{ id: 'a1' }])
    await getActiveAlertsForSymbol('MSFT')
    mockFindMany.mockClear()

    const result = await getActiveAlertsForSymbol('MSFT')

    expect(result).toEqual([{ id: 'a1' }])
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})

describe('invalidateAlertCache', () => {
  it('removes a symbol from the cache so the next read hits the DB again', async () => {
    mockFindMany.mockResolvedValue([{ id: 'a1' }])
    await getActiveAlertsForSymbol('TSLA')

    invalidateAlertCache('TSLA')
    mockFindMany.mockClear()
    mockFindMany.mockResolvedValue([{ id: 'a2' }])
    const result = await getActiveAlertsForSymbol('TSLA')

    expect(result).toEqual([{ id: 'a2' }])
    expect(mockFindMany).toHaveBeenCalledTimes(1)
  })
})

describe('getAlertCacheStats', () => {
  it('reports the currently cached symbols', async () => {
    invalidateAlertCache('AAPL')
    invalidateAlertCache('MSFT')
    invalidateAlertCache('TSLA')
    mockFindMany.mockResolvedValue([])
    await getActiveAlertsForSymbol('NVDA')

    const stats = getAlertCacheStats()

    expect(stats.symbols).toContain('NVDA')
    expect(stats.cachedSymbols).toBe(stats.symbols.length)
  })
})
