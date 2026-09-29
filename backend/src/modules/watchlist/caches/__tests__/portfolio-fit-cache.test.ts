jest.mock('../../../../shared/infrastructure/clients/finnhub-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../../../../shared/infrastructure/database', () => ({
  prisma: { portfolio: { findMany: jest.fn() } },
}))

jest.mock('../../../market', () => ({
  getCurrentPrice: jest.fn(),
}))

import finnhubClient from '../../../../shared/infrastructure/clients/finnhub-client'
import { prisma } from '../../../../shared/infrastructure/database'
import { getCurrentPrice } from '../../../market'
import {
  evictPortfolioFitEntry,
  fetchUserPositions,
  getPortfolioFit,
  invalidateUserPortfolioFitCache,
} from '../portfolio-fit-cache'

const mockFinnhubGet = (finnhubClient as unknown as { get: jest.Mock }).get
const mockPrisma = prisma as unknown as { portfolio: { findMany: jest.Mock } }

beforeEach(() => {
  jest.clearAllMocks()
  mockFinnhubGet.mockResolvedValue({ data: { finnhubIndustry: 'Technology' } })
  ;(getCurrentPrice as jest.Mock).mockResolvedValue(null)
})

describe('fetchUserPositions', () => {
  it('flattens positions across every portfolio the user has', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { positions: [{ symbol: 'AAPL' }] },
      { positions: [{ symbol: 'MSFT' }, { symbol: 'TSLA' }] },
    ])
    const result = await fetchUserPositions('user-1')
    expect(result.map((p: any) => p.symbol)).toEqual(['AAPL', 'MSFT', 'TSLA'])
  })
})

describe('getPortfolioFit', () => {
  it('flags overexposure when the projected sector share exceeds 30%', async () => {
    const positions = [
      {
        symbol: 'AAPL',
        quantity: 10,
        avgEntryPrice: 100,
        sector: 'Technology',
      },
    ]
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 100,
      changePercent: 0,
    })

    const fit = await getPortfolioFit('user-a1', 'NVDA', 100, positions)
    expect(fit.overexposureWarning).toBe(true)
    expect(fit.sector).toBe('Technology')
    expect(fit.message).toContain('overexpose')
  })

  it('does not flag overexposure when the projected sector share stays under 30%', async () => {
    // A well-diversified $4,000 portfolio (4 equal $1,000 sectors); adding a
    // symbol in a brand-new, unheld sector projects to only 1,000 / 5,000 =
    // 20% of the post-purchase total — comfortably under the 30% limit.
    const positions = [
      {
        symbol: 'AAPL',
        quantity: 10,
        avgEntryPrice: 100,
        sector: 'Technology',
      },
      { symbol: 'XOM', quantity: 10, avgEntryPrice: 100, sector: 'Energy' },
      { symbol: 'JPM', quantity: 10, avgEntryPrice: 100, sector: 'Financials' },
      { symbol: 'JNJ', quantity: 10, avgEntryPrice: 100, sector: 'Healthcare' },
    ]
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 100,
      changePercent: 0,
    })
    mockFinnhubGet.mockResolvedValue({
      data: { finnhubIndustry: 'Consumer Staples' },
    })

    const fit = await getPortfolioFit('user-a2', 'PG', 100, positions)
    expect(fit.overexposureWarning).toBe(false)
    expect(fit.message).toContain('keeps your')
  })

  it('treats an empty portfolio as zero current exposure, using currentPrice as the assumed investment', async () => {
    const fit = await getPortfolioFit('user-a3', 'AAPL', 150, [])
    expect(fit.currentSectorExposure).toBe('0%')
  })

  it('falls back to the average entry price when a live price is unavailable for a held symbol', async () => {
    const positions = [
      {
        symbol: 'AAPL',
        quantity: 10,
        avgEntryPrice: 100,
        sector: 'Technology',
      },
    ]
    ;(getCurrentPrice as jest.Mock).mockResolvedValue(null) // no live price
    const fit = await getPortfolioFit('user-a4', 'AAPL', 100, positions)
    expect(fit.sector).toBe('Technology')
  })

  it('buckets a position with no sector on file as Unknown', async () => {
    const positions = [
      { symbol: 'XYZ', quantity: 10, avgEntryPrice: 100, sector: null },
    ]
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 100,
      changePercent: 0,
    })
    mockFinnhubGet.mockResolvedValue({ data: {} })

    const fit = await getPortfolioFit('user-a5', 'XYZ', 100, positions)
    expect(fit.sector).toBe('Unknown')
  })

  it('falls back to Unknown when the Finnhub sector lookup itself fails', async () => {
    mockFinnhubGet.mockRejectedValue(new Error('finnhub down'))
    const fit = await getPortfolioFit('user-a6', 'AAPL', 100, [])
    expect(fit.sector).toBe('Unknown')
  })

  it('fetches positions itself when none are pre-supplied', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([])
    await getPortfolioFit('user-a7', 'AAPL', 100)
    expect(mockPrisma.portfolio.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-a7' },
      include: { positions: true },
    })
  })

  it('serves a fresh computation from cache on a repeat call at the same price', async () => {
    const positions = [
      {
        symbol: 'AAPL',
        quantity: 10,
        avgEntryPrice: 100,
        sector: 'Technology',
      },
    ]
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 100,
      changePercent: 0,
    })

    await getPortfolioFit('user-a8', 'AAPL', 100, positions)
    mockFinnhubGet.mockClear()
    await getPortfolioFit('user-a8', 'AAPL', 100, positions)

    expect(mockFinnhubGet).not.toHaveBeenCalled()
  })

  it('recomputes once the price has drifted more than 2% since the cached computation', async () => {
    const positions = [
      {
        symbol: 'AAPL',
        quantity: 10,
        avgEntryPrice: 100,
        sector: 'Technology',
      },
    ]
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 100,
      changePercent: 0,
    })

    await getPortfolioFit('user-a9', 'AAPL', 100, positions)
    mockFinnhubGet.mockClear()
    await getPortfolioFit('user-a9', 'AAPL', 103, positions) // >2% drift

    expect(mockFinnhubGet).toHaveBeenCalled()
  })
})

describe('evictPortfolioFitEntry', () => {
  it('forces a recompute for that symbol on the next call', async () => {
    const positions = [
      {
        symbol: 'AAPL',
        quantity: 10,
        avgEntryPrice: 100,
        sector: 'Technology',
      },
    ]
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 100,
      changePercent: 0,
    })

    await getPortfolioFit('user-b1', 'AAPL', 100, positions)
    evictPortfolioFitEntry('user-b1', 'AAPL')
    mockFinnhubGet.mockClear()
    await getPortfolioFit('user-b1', 'AAPL', 100, positions)

    expect(mockFinnhubGet).toHaveBeenCalled()
  })
})

describe('invalidateUserPortfolioFitCache', () => {
  it("clears every cached entry for the user, without touching other users' entries", async () => {
    const positions = [
      {
        symbol: 'AAPL',
        quantity: 10,
        avgEntryPrice: 100,
        sector: 'Technology',
      },
    ]
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 100,
      changePercent: 0,
    })

    await getPortfolioFit('user-c1', 'AAPL', 100, positions)
    await getPortfolioFit('user-c2', 'AAPL', 100, positions)

    invalidateUserPortfolioFitCache('user-c1')

    mockFinnhubGet.mockClear()
    await getPortfolioFit('user-c1', 'AAPL', 100, positions) // evicted -> recomputes
    expect(mockFinnhubGet).toHaveBeenCalledTimes(1)

    mockFinnhubGet.mockClear()
    await getPortfolioFit('user-c2', 'AAPL', 100, positions) // untouched -> still cached
    expect(mockFinnhubGet).not.toHaveBeenCalled()
  })
})
