jest.mock('../../../../shared/infrastructure/clients/finnhub-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../../../../shared/infrastructure/logger', () => ({
  logger: { error: jest.fn() },
}))

import finnhubClient from '../../../../shared/infrastructure/clients/finnhub-client'
import { logger } from '../../../../shared/infrastructure/logger'
import {
  fetchAndCacheQuote,
  formatWatchlistItem,
  getCurrentPrice,
  priceCache,
  updatePriceCache,
} from '../price-cache'

const mockGet = (finnhubClient as unknown as { get: jest.Mock }).get

const baseEntry = {
  symbol: 'AAPL',
  targetEntryPrice: null,
  stopLoss: null,
  notes: null,
  aiSuggestedEntry: null,
  aiTakeProfit: null,
  aiStopLoss: null,
  aiConfidence: null,
  aiSuggestionBasis: null,
  aiComputedAt: null,
  createdAt: new Date('2024-01-01'),
}

describe('formatWatchlistItem', () => {
  it('returns aiSuggested null when AI fields are absent', () => {
    const result = formatWatchlistItem(baseEntry)
    expect(result.aiSuggested).toBeNull()
  })

  it('populates aiSuggested only when every AI field is present', () => {
    const computedAt = new Date('2024-02-01T00:00:00Z')
    const result = formatWatchlistItem({
      ...baseEntry,
      aiSuggestedEntry: 100,
      aiTakeProfit: 120,
      aiStopLoss: 90,
      aiConfidence: 'HIGH',
      aiSuggestionBasis: 'trend',
      aiComputedAt: computedAt,
    })
    expect(result.aiSuggested).toEqual({
      entry: 100,
      takeProfit: 120,
      stopLoss: 90,
      confidence: 'HIGH',
      basis: 'trend',
      computedAt: computedAt.toISOString(),
    })
  })

  it('treats a missing suggestion basis as incomplete AI data', () => {
    const result = formatWatchlistItem({
      ...baseEntry,
      aiSuggestedEntry: 100,
      aiTakeProfit: 120,
      aiStopLoss: 90,
      aiConfidence: 'HIGH',
      aiSuggestionBasis: null,
      aiComputedAt: new Date(),
    })
    expect(result.aiSuggested).toBeNull()
  })
})

describe('updatePriceCache / fetchAndCacheQuote / getCurrentPrice', () => {
  beforeEach(() => {
    priceCache.clear()
    mockGet.mockReset()
  })

  it('defaults changePercent to 0 for a symbol never seen before', () => {
    updatePriceCache('AAPL', 150, 1000)
    expect(priceCache.get('AAPL')).toMatchObject({
      price: 150,
      changePercent: 0,
      volume: 1000,
    })
  })

  it('preserves the last known changePercent across WS ticks', () => {
    priceCache.set('AAPL', {
      price: 100,
      changePercent: 2.5,
      volume: 500,
      timestamp: Date.now(),
    })
    updatePriceCache('AAPL', 105, 600)
    expect(priceCache.get('AAPL')?.changePercent).toBe(2.5)
  })

  it('fetches from Finnhub REST and caches the result', async () => {
    mockGet.mockResolvedValue({ data: { c: 200, dp: 1.2, v: 999 } })
    const result = await fetchAndCacheQuote('AAPL')
    expect(result).toMatchObject({
      price: 200,
      changePercent: 1.2,
      volume: 999,
    })
    expect(priceCache.get('AAPL')).toEqual(result)
  })

  it('defaults volume to 0 when Finnhub omits it', async () => {
    mockGet.mockResolvedValue({ data: { c: 200, dp: 1.2 } })
    const result = await fetchAndCacheQuote('AAPL')
    expect(result.volume).toBe(0)
  })

  it('returns a fresh cached entry without hitting Finnhub', async () => {
    priceCache.set('AAPL', {
      price: 100,
      changePercent: 0,
      volume: 1,
      timestamp: Date.now(),
    })
    const result = await getCurrentPrice('AAPL')
    expect(result?.price).toBe(100)
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('refetches when the cached entry is stale', async () => {
    priceCache.set('AAPL', {
      price: 100,
      changePercent: 0,
      volume: 1,
      timestamp: Date.now() - 61_000,
    })
    mockGet.mockResolvedValue({ data: { c: 111, dp: 0.5, v: 10 } })
    const result = await getCurrentPrice('AAPL')
    expect(result?.price).toBe(111)
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('fetches when there is no cached entry at all', async () => {
    mockGet.mockResolvedValue({ data: { c: 111, dp: 0.5, v: 10 } })
    const result = await getCurrentPrice('MSFT')
    expect(result?.price).toBe(111)
  })

  it('falls back to the stale cached entry when the REST call fails', async () => {
    priceCache.set('AAPL', {
      price: 100,
      changePercent: 0,
      volume: 1,
      timestamp: Date.now() - 61_000,
    })
    mockGet.mockRejectedValue(new Error('finnhub down'))
    const result = await getCurrentPrice('AAPL')
    expect(result?.price).toBe(100)
    expect(logger.error).toHaveBeenCalled()
  })

  it('returns null when the REST call fails and there is no cached entry', async () => {
    mockGet.mockRejectedValue(new Error('finnhub down'))
    const result = await getCurrentPrice('MSFT')
    expect(result).toBeNull()
  })
})
