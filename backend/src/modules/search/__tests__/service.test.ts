jest.mock('../../../shared/infrastructure/cache', () => ({
  getCache: jest.fn(),
  setCache: jest.fn(),
}))

jest.mock('../../../shared/infrastructure/clients/finnhub-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}))

import { getCache, setCache } from '../../../shared/infrastructure/cache'
import finnhubClient from '../../../shared/infrastructure/clients/finnhub-client'
import { searchSymbols } from '../service'

const mockGetCache = getCache as jest.Mock
const mockSetCache = setCache as jest.Mock
const mockGet = (finnhubClient as unknown as { get: jest.Mock }).get

beforeEach(() => jest.clearAllMocks())

describe('searchSymbols', () => {
  it('returns cached results without calling Finnhub', async () => {
    mockGetCache.mockResolvedValue([
      { symbol: 'AAPL', description: 'Apple Inc', type: 'Common Stock' },
    ])
    const result = await searchSymbols('AAPL')
    expect(result).toEqual([
      { symbol: 'AAPL', description: 'Apple Inc', type: 'Common Stock' },
    ])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('normalizes the query for the cache key regardless of casing/whitespace', async () => {
    mockGetCache.mockResolvedValue(null)
    mockGet.mockResolvedValue({ data: { result: [] } })
    await searchSymbols('  AAPL  ', 'US')
    expect(mockGetCache).toHaveBeenCalledWith('search:US:aapl')
  })

  it('fetches from Finnhub, maps, and caches on a cache miss', async () => {
    mockGetCache.mockResolvedValue(null)
    mockGet.mockResolvedValue({
      data: {
        result: [
          {
            symbol: 'AAPL',
            description: 'Apple Inc',
            type: 'Common Stock',
            displaySymbol: 'AAPL',
          },
        ],
      },
    })

    const result = await searchSymbols('AAPL')

    expect(result).toEqual([
      { symbol: 'AAPL', description: 'Apple Inc', type: 'Common Stock' },
    ])
    expect(mockSetCache).toHaveBeenCalledWith(
      'search:US:aapl',
      result,
      expect.any(Number),
    )
  })

  it('returns an empty array when Finnhub responds without a result field', async () => {
    mockGetCache.mockResolvedValue(null)
    mockGet.mockResolvedValue({ data: {} })
    const result = await searchSymbols('ZZZ')
    expect(result).toEqual([])
    expect(mockSetCache).not.toHaveBeenCalled()
  })

  it('returns an empty array when Finnhub responds with no data at all', async () => {
    mockGetCache.mockResolvedValue(null)
    mockGet.mockResolvedValue({ data: null })
    const result = await searchSymbols('ZZZ')
    expect(result).toEqual([])
  })

  it('returns an empty array and swallows the error when Finnhub fails', async () => {
    mockGetCache.mockResolvedValue(null)
    mockGet.mockRejectedValue(new Error('finnhub down'))
    const result = await searchSymbols('AAPL')
    expect(result).toEqual([])
  })

  it('returns an empty array and swallows the error when the cache lookup itself fails', async () => {
    mockGetCache.mockRejectedValue(new Error('redis down'))
    const result = await searchSymbols('AAPL')
    expect(result).toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('defaults exchange to US when not provided', async () => {
    mockGetCache.mockResolvedValue(null)
    mockGet.mockResolvedValue({ data: { result: [] } })
    await searchSymbols('AAPL')
    expect(mockGet).toHaveBeenCalledWith(
      '/search',
      expect.objectContaining({ params: { q: 'AAPL', exchange: 'US' } }),
    )
  })
})
