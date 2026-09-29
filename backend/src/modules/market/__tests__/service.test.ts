jest.mock('../../../shared/infrastructure/cache', () => ({
  getCache: jest.fn(),
  setCache: jest.fn(),
}))

jest.mock('../../../shared/infrastructure/clients/finnhub-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../../../shared/infrastructure/clients/fmp-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../caches/logo-cache', () => ({
  getCompanyLogo: jest.fn(),
}))

jest.mock('../caches/price-cache', () => ({
  priceCache: new Map(),
}))

import { getCache, setCache } from '../../../shared/infrastructure/cache'
import finnhubClient from '../../../shared/infrastructure/clients/finnhub-client'
import fmpClient from '../../../shared/infrastructure/clients/fmp-client'
import { getCompanyLogo } from '../caches/logo-cache'
import { priceCache } from '../caches/price-cache'
import {
  getCompanySectors,
  getLivePrices,
  getRankedTopStocks,
} from '../service'

const mockFinnhubGet = (finnhubClient as unknown as { get: jest.Mock }).get
const mockFmpGet = (fmpClient as unknown as { get: jest.Mock }).get

beforeEach(() => {
  jest.clearAllMocks()
  priceCache.clear()
  ;(getCache as jest.Mock).mockResolvedValue(null)
  ;(setCache as jest.Mock).mockResolvedValue(undefined)
  ;(getCompanyLogo as jest.Mock).mockResolvedValue('')
})

describe('getRankedTopStocks', () => {
  it('returns the cached ranking without calling FMP/Finnhub on a cache hit', async () => {
    ;(getCache as jest.Mock).mockResolvedValue([{ symbol: 'AAPL', rank: 1 }])
    const result = await getRankedTopStocks()
    expect(result).toEqual([{ symbol: 'AAPL', rank: 1 }])
    expect(mockFmpGet).not.toHaveBeenCalled()
  })

  it('builds a ranked list from the top 10 FMP most-actives, enriched with Finnhub quotes and logos', async () => {
    mockFmpGet.mockResolvedValue({
      data: Array.from({ length: 15 }, (_, i) => ({ symbol: `SYM${i}` })),
    })
    mockFinnhubGet.mockResolvedValue({
      data: { c: 100, d: 1, dp: 1.5, pc: 99, h: 101, l: 98, o: 99.5, t: 123 },
    })
    ;(getCompanyLogo as jest.Mock).mockResolvedValue('https://logo/sym.png')

    const result = await getRankedTopStocks()

    expect(result).toHaveLength(10) // capped to top 10, even though FMP returned 15
    expect(result[0]).toEqual({
      rank: 1,
      logoUrl: 'https://logo/sym.png',
      symbol: 'SYM0',
      companyName: 'SYM0',
      price: 100,
      change: 1,
      changePercent: 1.5,
      previousClose: 99,
      high: 101,
      low: 98,
      open: 99.5,
      timestamp: 123,
    })
    expect(setCache).toHaveBeenCalledWith(
      'market:top-us-stocks',
      expect.any(Array),
      expect.any(Number),
    )
  })

  it('falls back to the "ticker" field when "symbol" is absent from an FMP row', async () => {
    mockFmpGet.mockResolvedValue({ data: [{ ticker: 'AAPL' }] })
    mockFinnhubGet.mockResolvedValue({
      data: { c: 100, d: 1, dp: 1, pc: 99, h: 101, l: 98, o: 99, t: 1 },
    })

    const result = await getRankedTopStocks()
    expect(result[0].symbol).toBe('AAPL')
  })

  it('skips an FMP row with neither symbol nor ticker', async () => {
    mockFmpGet.mockResolvedValue({ data: [{}, { symbol: 'AAPL' }] })
    mockFinnhubGet.mockResolvedValue({
      data: { c: 100, d: 1, dp: 1, pc: 99, h: 101, l: 98, o: 99, t: 1 },
    })

    const result = await getRankedTopStocks()
    expect(result).toHaveLength(1)
    expect(result[0].symbol).toBe('AAPL')
  })

  it('skips a symbol whose Finnhub quote lookup fails, without aborting the rest', async () => {
    mockFmpGet.mockResolvedValue({
      data: [{ symbol: 'FAIL' }, { symbol: 'AAPL' }],
    })
    mockFinnhubGet.mockImplementation((_url: string, config: any) =>
      config.params.symbol === 'FAIL'
        ? Promise.reject(new Error('finnhub down'))
        : Promise.resolve({
            data: { c: 100, d: 1, dp: 1, pc: 99, h: 101, l: 98, o: 99, t: 1 },
          }),
    )

    const result = await getRankedTopStocks()
    expect(result).toHaveLength(1)
    expect(result[0].symbol).toBe('AAPL')
  })

  it('does not cache an empty result set', async () => {
    mockFmpGet.mockResolvedValue({ data: [{ symbol: 'FAIL' }] })
    mockFinnhubGet.mockRejectedValue(new Error('finnhub down'))

    const result = await getRankedTopStocks()
    expect(result).toEqual([])
    expect(setCache).not.toHaveBeenCalled()
  })
})

describe('getLivePrices', () => {
  it('uses the in-memory WebSocket cache when the entry is still fresh', async () => {
    priceCache.set('AAPL', {
      price: 150,
      changePercent: 1,
      timestamp: Date.now(),
    } as any)

    const result = await getLivePrices(['AAPL'])
    expect(result).toEqual({ AAPL: 150 })
    expect(getCache).not.toHaveBeenCalled()
    expect(mockFinnhubGet).not.toHaveBeenCalled()
  })

  it('falls through to Redis when the in-memory entry is stale', async () => {
    priceCache.set('AAPL', {
      price: 150,
      changePercent: 1,
      timestamp: Date.now() - 10 * 60 * 1000,
    } as any)
    ;(getCache as jest.Mock).mockResolvedValue(155)

    const result = await getLivePrices(['AAPL'])
    expect(result).toEqual({ AAPL: 155 })
    expect(mockFinnhubGet).not.toHaveBeenCalled()
  })

  it('falls through to Finnhub REST on a full cache miss, and caches the result', async () => {
    mockFinnhubGet.mockResolvedValue({ data: { c: 160 } })
    const result = await getLivePrices(['AAPL'])
    expect(result).toEqual({ AAPL: 160 })
    expect(setCache).toHaveBeenCalledWith(
      'live_price:AAPL',
      160,
      expect.any(Number),
    )
  })

  it('defaults to a price of 0 when Finnhub returns no price field', async () => {
    mockFinnhubGet.mockResolvedValue({ data: {} })
    const result = await getLivePrices(['AAPL'])
    expect(result).toEqual({ AAPL: 0 })
  })

  it('defaults to 0 and logs when the Finnhub request itself fails', async () => {
    mockFinnhubGet.mockRejectedValue(new Error('finnhub down'))
    const result = await getLivePrices(['AAPL'])
    expect(result).toEqual({ AAPL: 0 })
  })

  it('resolves each symbol independently', async () => {
    priceCache.set('AAPL', {
      price: 150,
      changePercent: 1,
      timestamp: Date.now(),
    } as any)
    ;(getCache as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === 'live_price:MSFT' ? 300 : null),
    )
    mockFinnhubGet.mockResolvedValue({ data: { c: 50 } })

    const result = await getLivePrices(['AAPL', 'MSFT', 'TSLA'])
    expect(result).toEqual({ AAPL: 150, MSFT: 300, TSLA: 50 })
  })
})

describe('getCompanySectors', () => {
  it('returns the cached sector without calling Finnhub', async () => {
    ;(getCache as jest.Mock).mockResolvedValue('Technology')
    const result = await getCompanySectors(['AAPL'])
    expect(result).toEqual({ AAPL: 'Technology' })
    expect(mockFinnhubGet).not.toHaveBeenCalled()
  })

  it('fetches and caches the sector from Finnhub on a cache miss', async () => {
    mockFinnhubGet.mockResolvedValue({ data: { finnhubIndustry: 'Software' } })
    const result = await getCompanySectors(['AAPL'])
    expect(result).toEqual({ AAPL: 'Software' })
    expect(setCache).toHaveBeenCalledWith(
      'sector:AAPL',
      'Software',
      expect.any(Number),
    )
  })

  it('defaults to Unknown when Finnhub has no industry on file', async () => {
    mockFinnhubGet.mockResolvedValue({ data: {} })
    const result = await getCompanySectors(['AAPL'])
    expect(result).toEqual({ AAPL: 'Unknown' })
  })

  it('defaults to Unknown and logs when the Finnhub request fails', async () => {
    mockFinnhubGet.mockRejectedValue(new Error('finnhub down'))
    const result = await getCompanySectors(['AAPL'])
    expect(result).toEqual({ AAPL: 'Unknown' })
  })

  it('resolves each symbol independently', async () => {
    ;(getCache as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === 'sector:AAPL' ? 'Technology' : null),
    )
    mockFinnhubGet.mockResolvedValue({ data: { finnhubIndustry: 'Energy' } })

    const result = await getCompanySectors(['AAPL', 'XOM'])
    expect(result).toEqual({ AAPL: 'Technology', XOM: 'Energy' })
  })
})
