jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    portfolio: { findMany: jest.fn() },
    watchlist: { findMany: jest.fn() },
    user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    newsArticle: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    newsReadState: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      createMany: jest.fn(),
    },
    newsSavedArticle: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

jest.mock('../../../shared/infrastructure/cache', () => ({
  getCache: jest.fn(),
  setCache: jest.fn(),
}))

jest.mock('../news', () => ({
  resolveCursor: jest.fn(),
  rankArticles: jest.fn((rows: any[]) => rows),
  enrichArticles: jest.fn(async (_userId: string, rows: any[]) => rows),
}))

import { prisma } from '../../../shared/infrastructure/database'
import { getCache, setCache } from '../../../shared/infrastructure/cache'
import { resolveCursor, rankArticles, enrichArticles } from '../news'
import {
  feedCacheKey,
  getNewsBySymbol,
  getNewsFeed,
  getNewsSummary,
  getSavedNews,
  markAllArticlesAsRead,
  markArticleAsRead,
  markMultipleArticlesAsRead,
  saveArticle,
  symbolCacheKey,
  searchNews,
  unsaveArticle,
} from '../service'

const mockPrisma = prisma as unknown as {
  [model: string]: Record<string, jest.Mock>
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getCache as jest.Mock).mockResolvedValue(null)
  ;(setCache as jest.Mock).mockResolvedValue(undefined)
  ;(rankArticles as jest.Mock).mockImplementation((rows: any[]) => rows)
  ;(enrichArticles as jest.Mock).mockImplementation(
    async (_userId: string, rows: any[]) => rows,
  )
  mockPrisma.portfolio.findMany.mockResolvedValue([])
  mockPrisma.watchlist.findMany.mockResolvedValue([])
  mockPrisma.user.findUnique.mockResolvedValue({ marketInterests: [] })
})

describe('feedCacheKey / symbolCacheKey', () => {
  it('defaults category and cursor placeholders when omitted', () => {
    expect(feedCacheKey({ limit: 20 })).toBe(
      'news:feed:all:cat:all:cursor:start:limit:20',
    )
    expect(
      feedCacheKey({ category: 'EARNINGS', cursor: 'c1', limit: 10 }),
    ).toBe('news:feed:all:cat:EARNINGS:cursor:c1:limit:10')
  })

  it('builds a per-symbol cache key', () => {
    expect(symbolCacheKey({ symbol: 'AAPL', limit: 20 })).toBe(
      'news:symbol:AAPL:cursor:start:limit:20',
    )
  })
})

describe('getNewsFeed', () => {
  const baseQuery = { limit: 20 } as any

  it('returns an empty page immediately when a portfolio/watchlist filter resolves to no symbols', async () => {
    const result = await getNewsFeed('user-1', {
      ...baseQuery,
      filter: 'portfolio',
    })
    expect(result).toEqual({ data: [], nextCursor: null, hasMore: false })
    expect(mockPrisma.newsArticle.findMany).not.toHaveBeenCalled()
  })

  it('reuses the cached raw page for an uncursored, unfiltered "all" feed', async () => {
    ;(getCache as jest.Mock).mockResolvedValue({
      data: [{ id: 'a1', publishedAt: '2024-01-01T00:00:00.000Z' }],
      nextCursor: null,
      hasMore: false,
    })

    const result = await getNewsFeed('user-1', { ...baseQuery, filter: 'all' })
    expect(result.data).toHaveLength(1)
    expect(mockPrisma.newsArticle.findMany).not.toHaveBeenCalled()
  })

  it('queries and caches a fresh page on a cache miss for the cacheable "all" feed', async () => {
    mockPrisma.newsArticle.findMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, i) => ({
        id: `a${i}`,
        publishedAt: new Date(),
      })),
    )

    const result = await getNewsFeed('user-1', { ...baseQuery, filter: 'all' })
    expect(result.hasMore).toBe(true)
    expect(result.data).toHaveLength(20)
    expect(setCache).toHaveBeenCalled()
  })

  it('does not use or populate the raw cache when filtering by symbol', async () => {
    mockPrisma.newsArticle.findMany.mockResolvedValue([
      { id: 'a1', publishedAt: new Date() },
    ])

    await getNewsFeed('user-1', { ...baseQuery, symbol: 'AAPL' })
    expect(getCache).not.toHaveBeenCalled()
    expect(setCache).not.toHaveBeenCalled()
    expect(mockPrisma.newsArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          relatedSymbols: { hasSome: ['AAPL'] },
        }),
      }),
    )
  })

  it("filters to the user's portfolio symbols", async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { positions: [{ symbol: 'AAPL', sector: 'Tech' }] },
    ])
    mockPrisma.newsArticle.findMany.mockResolvedValue([])

    await getNewsFeed('user-1', { ...baseQuery, filter: 'portfolio' })
    expect(mockPrisma.newsArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          relatedSymbols: { hasSome: ['AAPL'] },
        }),
      }),
    )
  })

  it("filters to the user's watchlist symbols", async () => {
    mockPrisma.watchlist.findMany.mockResolvedValue([{ symbol: 'TSLA' }])
    mockPrisma.newsArticle.findMany.mockResolvedValue([])

    await getNewsFeed('user-1', { ...baseQuery, filter: 'watchlist' })
    expect(mockPrisma.newsArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          relatedSymbols: { hasSome: ['TSLA'] },
        }),
      }),
    )
  })

  it('resolves the cursor and applies category/date-range filters', async () => {
    ;(resolveCursor as jest.Mock).mockResolvedValue(new Date('2024-01-01'))
    mockPrisma.newsArticle.findMany.mockResolvedValue([])

    await getNewsFeed('user-1', {
      ...baseQuery,
      filter: 'all',
      cursor: 'cursor-1',
      category: 'EARNINGS',
      from: '2024-01-01',
      to: '2024-02-01',
    })

    expect(resolveCursor).toHaveBeenCalledWith('cursor-1')
    expect(mockPrisma.newsArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: 'EARNINGS',
          publishedAt: {
            gte: new Date('2024-01-01'),
            lte: new Date('2024-02-01'),
          },
        }),
      }),
    )
  })

  it('skips ranking for a non-"all" feed', async () => {
    mockPrisma.newsArticle.findMany.mockResolvedValue([
      { id: 'a1', publishedAt: new Date() },
    ])
    await getNewsFeed('user-1', { ...baseQuery, symbol: 'AAPL' })
    expect(rankArticles).not.toHaveBeenCalled()
  })
})

describe('getNewsBySymbol', () => {
  it('reuses the cached page when present', async () => {
    ;(getCache as jest.Mock).mockResolvedValue({
      data: [{ id: 'a1', publishedAt: '2024-01-01T00:00:00.000Z' }],
      nextCursor: null,
      hasMore: false,
    })
    const result = await getNewsBySymbol('user-1', 'AAPL', { limit: 20 } as any)
    expect(result.data).toHaveLength(1)
    expect(mockPrisma.newsArticle.findMany).not.toHaveBeenCalled()
  })

  it('queries and caches a fresh page on a cache miss', async () => {
    mockPrisma.newsArticle.findMany.mockResolvedValue([
      { id: 'a1', publishedAt: new Date() },
    ])
    const result = await getNewsBySymbol('user-1', 'AAPL', { limit: 20 } as any)
    expect(result.hasMore).toBe(false)
    expect(setCache).toHaveBeenCalled()
  })

  it('resolves an explicit cursor', async () => {
    ;(resolveCursor as jest.Mock).mockResolvedValue(new Date('2024-01-01'))
    mockPrisma.newsArticle.findMany.mockResolvedValue([])
    await getNewsBySymbol('user-1', 'AAPL', { cursor: 'c1', limit: 20 } as any)
    expect(resolveCursor).toHaveBeenCalledWith('c1')
  })
})

describe('searchNews', () => {
  it('applies the query, category, symbol and date filters together', async () => {
    mockPrisma.newsArticle.findMany.mockResolvedValue([])
    await searchNews('user-1', {
      q: 'earnings',
      symbol: 'AAPL',
      category: 'EARNINGS',
      from: '2024-01-01',
      to: '2024-02-01',
      limit: 20,
    } as any)

    expect(mockPrisma.newsArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          headline: { contains: 'earnings', mode: 'insensitive' },
          category: 'EARNINGS',
          relatedSymbols: { has: 'AAPL' },
          // Regression test for a from/to object-spread collision: both
          // bounds must merge into one publishedAt object, not overwrite
          // each other.
          publishedAt: {
            gte: new Date('2024-01-01'),
            lte: new Date('2024-02-01'),
          },
        }),
      }),
    )
  })

  it('paginates with hasMore/nextCursor when more rows exist than the limit', async () => {
    mockPrisma.newsArticle.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({
        id: `a${i}`,
        publishedAt: new Date(),
      })),
    )
    const result = await searchNews('user-1', { limit: 2 } as any)
    expect(result.hasMore).toBe(true)
    expect(result.nextCursor).toBe('a1')
  })

  it('resolves an explicit cursor', async () => {
    ;(resolveCursor as jest.Mock).mockResolvedValue(new Date('2024-01-01'))
    mockPrisma.newsArticle.findMany.mockResolvedValue([])
    await searchNews('user-1', { cursor: 'c1', limit: 20 } as any)
    expect(resolveCursor).toHaveBeenCalledWith('c1')
  })
})

describe('getNewsSummary', () => {
  it('separates portfolio, watchlist and general headlines, dedupes overlap, and counts unread', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      createdAt: new Date('2024-01-01'),
    })
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { positions: [{ symbol: 'AAPL' }] },
    ])
    mockPrisma.watchlist.findMany.mockResolvedValue([{ symbol: 'TSLA' }])
    mockPrisma.newsReadState.findMany.mockResolvedValue([{ articleId: 'a1' }])
    mockPrisma.newsArticle.findMany
      .mockResolvedValueOnce([
        {
          id: 'a1',
          headline: 'AAPL up',
          relatedSymbols: ['AAPL'],
          sentiment: 'BULLISH',
          publishedAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'a2',
          headline: 'TSLA down',
          relatedSymbols: ['TSLA'],
          sentiment: 'BEARISH',
          publishedAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'a1',
          headline: 'AAPL up',
          relatedSymbols: ['AAPL'],
          sentiment: 'BULLISH',
          publishedAt: new Date(),
        },
        {
          id: 'a3',
          headline: 'General market news',
          relatedSymbols: [],
          sentiment: 'NEUTRAL',
          publishedAt: new Date(),
        },
      ])
    mockPrisma.newsArticle.count.mockResolvedValue(5)

    const result = await getNewsSummary('user-1')

    expect(result.portfolioNews[0]).toMatchObject({
      id: 'a1',
      symbol: 'AAPL',
      isRead: true,
    })
    expect(result.watchlistNews[0]).toMatchObject({
      id: 'a2',
      symbol: 'TSLA',
      isRead: false,
    })
    // a1 already appears in portfolioNews, so it's excluded from marketHeadlines
    expect(result.marketHeadlines.map((h) => h.id)).toEqual(['a3'])
    expect(result.marketHeadlines[0].symbol).toBeNull()
    expect(result.unreadCount).toBe(5)
  })

  it('skips the portfolio/watchlist queries entirely when the user holds nothing', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      createdAt: new Date('2024-01-01'),
    })
    mockPrisma.newsReadState.findMany.mockResolvedValue([])
    mockPrisma.newsArticle.findMany.mockResolvedValue([])
    mockPrisma.newsArticle.count.mockResolvedValue(0)

    const result = await getNewsSummary('user-1')
    expect(result.portfolioNews).toEqual([])
    expect(result.watchlistNews).toEqual([])
    // Only the general-headlines query should have run against newsArticle.findMany
    expect(mockPrisma.newsArticle.findMany).toHaveBeenCalledTimes(1)
  })
})

describe('getSavedNews', () => {
  it('rejects an invalid or expired cursor', async () => {
    mockPrisma.newsSavedArticle.findFirst.mockResolvedValue(null)
    await expect(
      getSavedNews('user-1', { cursor: 'missing', limit: 20 } as any),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('paginates saved articles by savedAt/articleId', async () => {
    mockPrisma.newsSavedArticle.findMany.mockResolvedValue([
      { articleId: 'a1', savedAt: new Date(), article: { id: 'a1' } },
    ])
    const result = await getSavedNews('user-1', { limit: 20 } as any)
    expect(result.data[0]).toMatchObject({ id: 'a1', isSaved: true })
  })

  it('paginates with hasMore/nextCursor when more saved rows exist than the limit', async () => {
    mockPrisma.newsSavedArticle.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({
        articleId: `a${i}`,
        savedAt: new Date(),
        article: { id: `a${i}` },
      })),
    )
    const result = await getSavedNews('user-1', { limit: 2 } as any)
    expect(result.hasMore).toBe(true)
    expect(result.nextCursor).toBe('a1')
    expect(result.data).toHaveLength(2)
  })

  it('resolves a valid cursor before paginating', async () => {
    mockPrisma.newsSavedArticle.findFirst.mockResolvedValue({
      savedAt: new Date('2024-01-01'),
    })
    mockPrisma.newsSavedArticle.findMany.mockResolvedValue([])
    await getSavedNews('user-1', { cursor: 'a0', limit: 20 } as any)
    expect(mockPrisma.newsSavedArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { savedAt: { lt: new Date('2024-01-01') } },
            { savedAt: new Date('2024-01-01'), articleId: { lt: 'a0' } },
          ],
        }),
      }),
    )
  })
})

describe('markArticleAsRead', () => {
  it('throws when the article does not exist', async () => {
    mockPrisma.newsArticle.findUnique.mockResolvedValue(null)
    await expect(markArticleAsRead('user-1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('upserts the read state and confirms', async () => {
    mockPrisma.newsArticle.findUnique.mockResolvedValue({ id: 'a1' })
    const result = await markArticleAsRead('user-1', 'a1')
    expect(result).toEqual({ id: 'a1', isRead: true })
    expect(mockPrisma.newsReadState.upsert).toHaveBeenCalled()
  })
})

describe('markMultipleArticlesAsRead', () => {
  it('creates read-state rows for each id, skipping duplicates', async () => {
    mockPrisma.newsReadState.createMany.mockResolvedValue({ count: 2 })
    const result = await markMultipleArticlesAsRead('user-1', ['a1', 'a2'])
    expect(result.updated).toBe(2)
    expect(result.data).toEqual([
      { id: 'a1', isRead: true },
      { id: 'a2', isRead: true },
    ])
  })
})

describe('markAllArticlesAsRead', () => {
  it('short-circuits when there is nothing unread', async () => {
    mockPrisma.newsArticle.findMany.mockResolvedValue([])
    const result = await markAllArticlesAsRead('user-1')
    expect(result).toEqual({ updated: 0 })
    expect(mockPrisma.newsReadState.createMany).not.toHaveBeenCalled()
  })

  it('marks every unread article as read', async () => {
    mockPrisma.newsArticle.findMany.mockResolvedValue([
      { id: 'a1' },
      { id: 'a2' },
    ])
    mockPrisma.newsReadState.createMany.mockResolvedValue({ count: 2 })
    const result = await markAllArticlesAsRead('user-1')
    expect(result).toEqual({ updated: 2 })
  })
})

describe('saveArticle', () => {
  it('throws when the article does not exist', async () => {
    mockPrisma.newsArticle.findUnique.mockResolvedValue(null)
    await expect(saveArticle('user-1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('upserts the saved state and confirms', async () => {
    mockPrisma.newsArticle.findUnique.mockResolvedValue({ id: 'a1' })
    const result = await saveArticle('user-1', 'a1')
    expect(result).toEqual({ id: 'a1', isSaved: true })
  })
})

describe('unsaveArticle', () => {
  it('throws when the article was never saved', async () => {
    mockPrisma.newsSavedArticle.findUnique.mockResolvedValue(null)
    await expect(unsaveArticle('user-1', 'a1')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('deletes the saved-article row', async () => {
    mockPrisma.newsSavedArticle.findUnique.mockResolvedValue({ id: 'saved-1' })
    const result = await unsaveArticle('user-1', 'a1')
    expect(result).toEqual({ id: 'a1', isSaved: false })
    expect(mockPrisma.newsSavedArticle.delete).toHaveBeenCalled()
  })
})
