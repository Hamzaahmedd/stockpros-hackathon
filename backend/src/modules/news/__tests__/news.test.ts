jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    newsReadState: { findMany: jest.fn() },
    newsSavedArticle: { findMany: jest.fn() },
    portfolio: { findMany: jest.fn() },
    watchlist: { findMany: jest.fn() },
    newsArticle: { findUnique: jest.fn() },
  },
}))

jest.mock('../../notifications/public', () => ({
  INTEREST_TO_CATEGORIES: {
    ai_tech: { categories: ['ANALYST', 'GENERAL'], sectors: ['technology'] },
    energy: { categories: ['MACRO'], sectors: ['energy'] },
  },
}))

import { prisma } from '../../../shared/infrastructure/database'
import {
  daysAgo,
  enrichArticles,
  rankArticles,
  resolveCursor,
  toDateStr,
} from '../news'

const mockPrisma = prisma as unknown as {
  [model: string]: Record<string, jest.Mock>
}

beforeEach(() => jest.clearAllMocks())

describe('enrichArticles', () => {
  it('returns an empty array without querying anything for an empty article list', async () => {
    expect(await enrichArticles('user-1', [])).toEqual([])
    expect(mockPrisma.newsReadState.findMany).not.toHaveBeenCalled()
  })

  it('attaches read/saved state and portfolio/watchlist context', async () => {
    mockPrisma.newsReadState.findMany.mockResolvedValue([{ articleId: 'a1' }])
    mockPrisma.newsSavedArticle.findMany.mockResolvedValue([])
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { positions: [{ symbol: 'AAPL' }] },
    ])
    mockPrisma.watchlist.findMany.mockResolvedValue([{ symbol: 'TSLA' }])

    const [result] = await enrichArticles('user-1', [
      { id: 'a1', relatedSymbols: ['AAPL'] } as any,
    ])

    expect(result.isRead).toBe(true)
    expect(result.isSaved).toBe(false)
    expect(result.userContext.inPortfolio).toBe(true)
    expect(result.userContext.inWatchlist).toBe(false)
  })

  it('flags watchlist membership independently of portfolio membership', async () => {
    mockPrisma.newsReadState.findMany.mockResolvedValue([])
    mockPrisma.newsSavedArticle.findMany.mockResolvedValue([
      { articleId: 'a1' },
    ])
    mockPrisma.portfolio.findMany.mockResolvedValue([])
    mockPrisma.watchlist.findMany.mockResolvedValue([{ symbol: 'TSLA' }])

    const [result] = await enrichArticles('user-1', [
      { id: 'a1', relatedSymbols: ['TSLA'] } as any,
    ])

    expect(result.isSaved).toBe(true)
    expect(result.userContext.inWatchlist).toBe(true)
    expect(result.userContext.inPortfolio).toBe(false)
  })
})

describe('rankArticles', () => {
  const article = (overrides: Record<string, any> = {}): any => ({
    id: 'a1',
    relatedSymbols: [],
    category: 'GENERAL',
    sector: null,
    ...overrides,
  })

  it('ranks a portfolio-symbol match highest', () => {
    const [result] = rankArticles(
      [article({ relatedSymbols: ['AAPL'] })],
      new Set(['AAPL']),
      new Set(),
      new Set(),
    )
    expect((result as any)._rank).toBe(1)
  })

  it('ranks a watchlist-symbol match second', () => {
    const [result] = rankArticles(
      [article({ relatedSymbols: ['TSLA'] })],
      new Set(),
      new Set(['TSLA']),
      new Set(),
    )
    expect((result as any)._rank).toBe(2)
  })

  it('ranks a portfolio-sector SECTOR article third', () => {
    const [result] = rankArticles(
      [article({ category: 'SECTOR', sector: 'Technology' })],
      new Set(),
      new Set(),
      new Set(['Technology']),
    )
    expect((result as any)._rank).toBe(3)
  })

  it('ranks an interest-category match at 3.5, below explicit holdings/sector matches', () => {
    const [result] = rankArticles(
      [article({ category: 'ANALYST' })],
      new Set(),
      new Set(),
      new Set(),
      ['ai_tech'],
    )
    expect((result as any)._rank).toBe(3.5)
  })

  it('ranks an interest-sector match (case-insensitively) at 3.5', () => {
    const [result] = rankArticles(
      [article({ sector: 'TECHNOLOGY' })],
      new Set(),
      new Set(),
      new Set(),
      ['ai_tech'],
    )
    expect((result as any)._rank).toBe(3.5)
  })

  it('ranks everything else last, at 4', () => {
    const [result] = rankArticles([article()], new Set(), new Set(), new Set())
    expect((result as any)._rank).toBe(4)
  })

  it('sorts the final list by ascending rank', () => {
    const results = rankArticles(
      [
        article({ id: 'low', relatedSymbols: [] }),
        article({ id: 'high', relatedSymbols: ['AAPL'] }),
      ],
      new Set(['AAPL']),
      new Set(),
      new Set(),
    )
    expect(results.map((r) => r.id)).toEqual(['high', 'low'])
  })

  it('defaults to no market-interest boost when none are supplied', () => {
    const [result] = rankArticles([article()], new Set(), new Set(), new Set())
    expect((result as any)._rank).toBe(4)
  })

  it('tolerates an unrecognized market interest value (treated as no categories/sectors)', () => {
    const [result] = rankArticles(
      [article()],
      new Set(),
      new Set(),
      new Set(),
      ['not_a_real_interest' as any],
    )
    expect((result as any)._rank).toBe(4)
  })

  it('still ranks last when active interests are present but none of them match', () => {
    const [result] = rankArticles(
      [article({ category: 'GENERAL', sector: null })],
      new Set(),
      new Set(),
      new Set(),
      ['energy'],
    )
    expect((result as any)._rank).toBe(4)
  })
})

describe('resolveCursor', () => {
  it('throws for an invalid or expired cursor', async () => {
    mockPrisma.newsArticle.findUnique.mockResolvedValue(null)
    await expect(resolveCursor('missing')).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it("resolves to the cursor article's publishedAt", async () => {
    const publishedAt = new Date('2024-01-01')
    mockPrisma.newsArticle.findUnique.mockResolvedValue({ publishedAt })
    expect(await resolveCursor('a1')).toBe(publishedAt)
  })
})

describe('toDateStr / daysAgo', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(toDateStr(new Date('2024-03-15T12:34:56Z'))).toBe('2024-03-15')
  })

  it('computes a date n days in the past', () => {
    const before = Date.now()
    const result = daysAgo(5)
    const expectedMs = 5 * 24 * 60 * 60 * 1000
    expect(before - result.getTime()).toBeGreaterThanOrEqual(expectedMs - 1000)
    expect(before - result.getTime()).toBeLessThanOrEqual(expectedMs + 1000)
  })
})
