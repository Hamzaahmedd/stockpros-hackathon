jest.mock('../../../../shared/infrastructure/database', () => ({
  prisma: {
    newsArticle: { findUnique: jest.fn(), create: jest.fn() },
  },
}))

jest.mock('../../../../shared/infrastructure/clients/polygon-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../../../../shared/infrastructure/clients/finnhub-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../../../../shared/infrastructure/cache', () => ({
  getCache: jest.fn(),
  setCache: jest.fn(),
}))

jest.mock('../../utils/summary-parser', () => ({
  parseSummaryBullets: jest.fn((raw: string) => (raw ? [raw] : [])),
}))

import { prisma } from '../../../../shared/infrastructure/database'
import polygonClient from '../../../../shared/infrastructure/clients/polygon-client'
import finnhubClient from '../../../../shared/infrastructure/clients/finnhub-client'
import { getCache, setCache } from '../../../../shared/infrastructure/cache'
import {
  fetchAndIngestAllSymbols,
  fetchAndIngestGeneralNews,
  fetchAndIngestSymbolNews,
  ingestArticles,
  mapPolygonCategory,
  mapPolygonSentiment,
} from '../news-fetcher'
import type { NormalisedArticle } from '../../types'

const mockPrisma = prisma as unknown as {
  newsArticle: { findUnique: jest.Mock; create: jest.Mock }
}
const mockPolygonGet = (polygonClient as unknown as { get: jest.Mock }).get
const mockFinnhubGet = (finnhubClient as unknown as { get: jest.Mock }).get

beforeEach(() => {
  jest.clearAllMocks()
  ;(getCache as jest.Mock).mockResolvedValue(null)
  ;(setCache as jest.Mock).mockResolvedValue(undefined)
  mockPrisma.newsArticle.findUnique.mockResolvedValue(null)
  mockPrisma.newsArticle.create.mockResolvedValue({})
})

describe('mapPolygonCategory', () => {
  const cases: [string[], string, string][] = [
    [['earnings'], 'Q1 report', 'EARNINGS'],
    [[], 'Company beats EPS estimates', 'EARNINGS'],
    [['analyst'], 'headline', 'ANALYST'],
    [[], 'Sets a new price target', 'ANALYST'],
    [['sec'], 'headline', 'FILING'],
    [[], 'Files new filing', 'FILING'],
    [['merger'], 'headline', 'MERGER'],
    [[], 'Acquisition announced', 'MERGER'],
    [['fed'], 'headline', 'MACRO'],
    [[], 'Inflation data released', 'MACRO'],
    [[], 'Interest rate decision', 'MACRO'],
    // Regression test: "sector".includes('sec') is true, so without an
    // explicit exclusion this used to fall into FILING and never reach here.
    [['sector'], 'headline', 'SECTOR'],
    [[], 'Industry outlook', 'SECTOR'],
    [[], 'Completely unrelated headline', 'GENERAL'],
  ]

  it.each(cases)(
    'keywords=%p headline=%p -> %s',
    (keywords, headline, expected) => {
      expect(mapPolygonCategory(keywords, headline)).toBe(expected)
    },
  )
})

describe('mapPolygonSentiment', () => {
  it('maps positive/negative/neutral to BULLISH/BEARISH/NEUTRAL', () => {
    expect(mapPolygonSentiment('positive')).toEqual({
      sentiment: 'BULLISH',
      sentimentScore: 0.75,
    })
    expect(mapPolygonSentiment('negative')).toEqual({
      sentiment: 'BEARISH',
      sentimentScore: -0.75,
    })
    expect(mapPolygonSentiment('neutral')).toEqual({
      sentiment: 'NEUTRAL',
      sentimentScore: 0,
    })
  })

  it('is case-insensitive', () => {
    expect(mapPolygonSentiment('POSITIVE').sentiment).toBe('BULLISH')
  })

  it('returns nulls for an unrecognized or missing sentiment', () => {
    expect(mapPolygonSentiment('mixed')).toEqual({
      sentiment: null,
      sentimentScore: null,
    })
    expect(mapPolygonSentiment(undefined)).toEqual({
      sentiment: null,
      sentimentScore: null,
    })
  })
})

describe('ingestArticles', () => {
  const article = (
    overrides: Partial<NormalisedArticle> = {},
  ): NormalisedArticle => ({
    url: 'https://example.com/a',
    headline: 'Headline',
    rawSummary: 'Summary',
    source: 'Polygon',
    imageUrl: null,
    publishedAt: new Date(),
    category: 'GENERAL',
    sentiment: null,
    sentimentScore: null,
    relatedSymbols: ['AAPL'],
    sector: null,
    ...overrides,
  })

  it('skips articles with a blank headline or url', async () => {
    const result = await ingestArticles([
      article({ headline: '   ' }),
      article({ url: '  ' }),
    ])
    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 2 })
    expect(mockPrisma.newsArticle.create).not.toHaveBeenCalled()
  })

  it('skips an article that already exists (by url)', async () => {
    mockPrisma.newsArticle.findUnique.mockResolvedValue({ id: 'existing' })
    const result = await ingestArticles([article()])
    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 1 })
    expect(mockPrisma.newsArticle.create).not.toHaveBeenCalled()
  })

  it('inserts a genuinely new article', async () => {
    const result = await ingestArticles([article()])
    expect(result).toEqual({ inserted: 1, updated: 0, skipped: 0 })
    expect(mockPrisma.newsArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ url: article().url }),
      }),
    )
  })

  it('counts a failed insert as skipped rather than throwing', async () => {
    mockPrisma.newsArticle.create.mockRejectedValue(
      new Error('unique constraint'),
    )
    const result = await ingestArticles([article()])
    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 1 })
  })
})

describe('fetchAndIngestSymbolNews', () => {
  it('does nothing when Polygon returns no articles for the symbol', async () => {
    mockPolygonGet.mockResolvedValue({ data: { results: [] } })
    await fetchAndIngestSymbolNews('AAPL', '2024-01-01')
    expect(mockFinnhubGet).not.toHaveBeenCalled()
    expect(mockPrisma.newsArticle.create).not.toHaveBeenCalled()
  })

  it('enriches with sector and ingests when articles are found', async () => {
    mockPolygonGet.mockResolvedValue({
      data: {
        results: [
          {
            title: 'AAPL beats earnings',
            article_url: 'https://example.com/aapl',
            description: 'desc',
            published_utc: '2024-01-01T00:00:00Z',
            publisher: { name: 'Polygon' },
            tickers: ['aapl'],
            keywords: ['earnings'],
            insights: [{ ticker: 'AAPL', sentiment: 'positive' }],
          },
        ],
      },
    })
    mockFinnhubGet.mockResolvedValue({
      data: { finnhubIndustry: 'Technology' },
    })

    await fetchAndIngestSymbolNews('AAPL', '2024-01-01')

    expect(mockPrisma.newsArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sector: 'Technology',
          category: 'EARNINGS',
          sentiment: 'BULLISH',
          relatedSymbols: ['AAPL'],
        }),
      }),
    )
    expect(setCache).toHaveBeenCalledWith(
      'sector:AAPL',
      'Technology',
      expect.any(Number),
    )
  })

  it('filters out Polygon results missing a url or title', async () => {
    mockPolygonGet.mockResolvedValue({
      data: {
        results: [
          {
            title: '',
            article_url: 'https://x',
            published_utc: '2024-01-01T00:00:00Z',
          },
          {
            title: 'ok',
            article_url: '',
            published_utc: '2024-01-01T00:00:00Z',
          },
        ],
      },
    })
    await fetchAndIngestSymbolNews('AAPL', '2024-01-01')
    expect(mockPrisma.newsArticle.create).not.toHaveBeenCalled()
  })

  it('returns null sector (and skips caching) when Finnhub has no industry on file', async () => {
    mockPolygonGet.mockResolvedValue({
      data: {
        results: [
          {
            title: 'AAPL news',
            article_url: 'https://example.com/aapl',
            published_utc: '2024-01-01T00:00:00Z',
          },
        ],
      },
    })
    mockFinnhubGet.mockResolvedValue({ data: {} })

    await fetchAndIngestSymbolNews('AAPL', '2024-01-01')
    expect(setCache).not.toHaveBeenCalled()
    expect(mockPrisma.newsArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sector: null }),
      }),
    )
  })

  it('reuses a cached sector without calling Finnhub', async () => {
    ;(getCache as jest.Mock).mockResolvedValue('Technology')
    mockPolygonGet.mockResolvedValue({
      data: {
        results: [
          {
            title: 'AAPL news',
            article_url: 'https://example.com/aapl',
            published_utc: '2024-01-01T00:00:00Z',
          },
        ],
      },
    })

    await fetchAndIngestSymbolNews('AAPL', '2024-01-01')
    expect(mockFinnhubGet).not.toHaveBeenCalled()
  })

  it('returns null sector when the Finnhub lookup itself fails', async () => {
    mockPolygonGet.mockResolvedValue({
      data: {
        results: [
          {
            title: 'AAPL news',
            article_url: 'https://example.com/aapl',
            published_utc: '2024-01-01T00:00:00Z',
          },
        ],
      },
    })
    mockFinnhubGet.mockRejectedValue(new Error('finnhub down'))

    await fetchAndIngestSymbolNews('AAPL', '2024-01-01')
    expect(mockPrisma.newsArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sector: null }),
      }),
    )
  })
})

describe('fetchAndIngestGeneralNews', () => {
  it('does nothing when there are no articles', async () => {
    mockPolygonGet.mockResolvedValue({ data: { results: [] } })
    await fetchAndIngestGeneralNews()
    expect(mockPrisma.newsArticle.create).not.toHaveBeenCalled()
  })

  it('ingests general articles, defaulting to the first insight when no symbol is given', async () => {
    mockPolygonGet.mockResolvedValue({
      data: {
        results: [
          {
            title: 'General market news',
            article_url: 'https://example.com/general',
            published_utc: '2024-01-01T00:00:00Z',
            tickers: [],
            insights: [{ ticker: 'MSFT', sentiment: 'negative' }],
          },
        ],
      },
    })
    await fetchAndIngestGeneralNews()
    expect(mockPrisma.newsArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sentiment: 'BEARISH' }),
      }),
    )
  })

  it('falls back to "Polygon" as the source when no publisher is given', async () => {
    mockPolygonGet.mockResolvedValue({
      data: {
        results: [
          {
            title: 'General market news',
            article_url: 'https://example.com/general2',
            published_utc: '2024-01-01T00:00:00Z',
          },
        ],
      },
    })
    await fetchAndIngestGeneralNews()
    expect(mockPrisma.newsArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'Polygon' }),
      }),
    )
  })

  it('treats a non-array results field as no articles', async () => {
    mockPolygonGet.mockResolvedValue({ data: {} })
    await expect(fetchAndIngestGeneralNews()).resolves.toBeUndefined()
    expect(mockPrisma.newsArticle.create).not.toHaveBeenCalled()
  })
})

describe('fetchAndIngestAllSymbols', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockPolygonGet.mockResolvedValue({ data: { results: [] } })
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('processes every symbol, pausing between calls but not after the last one', async () => {
    const promise = fetchAndIngestAllSymbols(
      ['AAPL', 'MSFT', 'TSLA'],
      '2024-01-01',
    )
    await jest.runAllTimersAsync()
    await promise

    expect(mockPolygonGet).toHaveBeenCalledTimes(3)
  })
})
