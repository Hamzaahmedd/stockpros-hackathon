import { prisma }                from '../../../shared/infrastructure/database'
import polygonClient             from '../../../shared/infrastructure/clients/polygon-client'
import finnhubClient             from '../../../shared/infrastructure/clients/finnhub-client'
import { parseSummaryBullets }   from '../utils/summary-parser'
import { getCache, setCache }    from '../../../shared/infrastructure/cache'
import {
  POLYGON_ARTICLE_LIMIT,
  POLYGON_RATE_LIMIT_DELAY,
  SECTOR_CACHE_TTL_SECONDS,
} from '../constants'
import type { NewsCategory, NewsSentiment } from '@prisma/client'
import type { NormalisedArticle } from '../types'

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

export const mapPolygonCategory = (keywords: string[], headline: string): NewsCategory => {
  const all = [...keywords.map(k => k.toLowerCase()), headline.toLowerCase()].join(' ')
  if (all.includes('earning') || all.includes('eps'))                                    return 'EARNINGS'
  if (all.includes('analyst') || all.includes('price target'))                           return 'ANALYST'
  if (all.includes('sec') || all.includes('filing'))                                     return 'FILING'
  if (all.includes('merger') || all.includes('acquisition'))                             return 'MERGER'
  if (all.includes('fed') || all.includes('inflation') || all.includes('interest rate')) return 'MACRO'
  if (all.includes('sector') || all.includes('industry'))                                return 'SECTOR'
  return 'GENERAL'
}

export const mapPolygonSentiment = (
  sentiment?: string,
): { sentiment: NewsSentiment | null; sentimentScore: number | null } => {
  const map: Record<string, { sentiment: NewsSentiment; score: number }> = {
    positive: { sentiment: 'BULLISH', score:  0.75 },
    negative: { sentiment: 'BEARISH', score: -0.75 },
    neutral:  { sentiment: 'NEUTRAL', score:  0    },
  }
  const match = sentiment ? map[sentiment.toLowerCase()] : undefined
  return {
    sentiment:      match?.sentiment ?? null,
    sentimentScore: match?.score     ?? null,
  }
}

const getSectorForSymbol = async (symbol: string): Promise<string | null> => {
  const cacheKey = `sector:${symbol}`
  const cached   = await getCache<string>(cacheKey)
  if (cached) return cached

  try {
    const { data } = await finnhubClient.get<{ finnhubIndustry?: string }>(
      '/stock/profile2',
      { params: { symbol } },
    )
    const sector = data.finnhubIndustry ?? null
    if (sector) await setCache(cacheKey, sector, SECTOR_CACHE_TTL_SECONDS)
    return sector
  } catch {
    return null
  }
}

const fetchPolygonNews = async (
  symbol?:   string,
  fromDate?: string,
): Promise<NormalisedArticle[]> => {
  const params: Record<string, string | number> = {
    limit: POLYGON_ARTICLE_LIMIT,
    order: 'desc',
    sort:  'published_utc',
  }
  if (symbol)   params['ticker']            = symbol.toUpperCase()
  if (fromDate) params['published_utc.gte'] = fromDate

  const { data } = await polygonClient.get<{
    results: Array<{
      title:         string
      description:   string
      article_url:   string
      image_url:     string | null
      published_utc: string
      publisher:     { name: string }
      tickers:       string[]
      keywords:      string[]
      insights?:     Array<{ ticker: string; sentiment: string }>
    }>
  }>('/v2/reference/news', { params })

  if (!Array.isArray(data.results)) return []

  return data.results
    .filter((a) => a.article_url && a.title)
    .map((a) => {
      const primaryInsight = symbol
        ? a.insights?.find((i) => i.ticker === symbol.toUpperCase())
        : a.insights?.[0]

      const { sentiment, sentimentScore } = mapPolygonSentiment(primaryInsight?.sentiment)

      return {
        url:            a.article_url,
        headline:       a.title,
        rawSummary:     a.description  ?? '',
        source:         a.publisher?.name ?? 'Polygon',
        imageUrl:       a.image_url    ?? null,
        publishedAt:    new Date(a.published_utc),
        category:       mapPolygonCategory(a.keywords ?? [], a.title),
        sentiment,
        sentimentScore,
        relatedSymbols: (a.tickers ?? []).map((t: string) => t.toUpperCase()),
        sector:         null,
      }
    })
}

export const ingestArticles = async (
  articles: NormalisedArticle[],
): Promise<{ inserted: number; updated: number; skipped: number }> => {
  let inserted = 0, updated = 0, skipped = 0

  for (const article of articles) {
    if (!article.headline.trim() || !article.url.trim()) { skipped++; continue }

    const summaryBullets = parseSummaryBullets(article.rawSummary)

    try {
      const existing = await prisma.newsArticle.findUnique({
        where:  { url: article.url },
        select: { id: true },
      })

      if (existing) { skipped++; continue }

      await prisma.newsArticle.create({
        data: {
          url:            article.url,
          headline:       article.headline,
          summaryBullets,
          source:         article.source,
          imageUrl:       article.imageUrl,
          publishedAt:    article.publishedAt,
          category:       article.category,
          sentiment:      article.sentiment,
          sentimentScore: article.sentimentScore,
          relatedSymbols: article.relatedSymbols,
          sector:         article.sector,
        },
      })
      inserted++
    } catch {
      skipped++
    }
  }

  return { inserted, updated, skipped }
}

export const fetchAndIngestSymbolNews = async (
  symbol:   string,
  fromDate: string,
): Promise<void> => {
  const articles = await fetchPolygonNews(symbol, fromDate)
  if (articles.length === 0) return

  const sector = await getSectorForSymbol(symbol)
  const enriched = articles.map(a => ({ ...a, sector }))

  await ingestArticles(enriched)
}

export const fetchAndIngestGeneralNews = async (): Promise<void> => {
  const articles = await fetchPolygonNews()
  if (articles.length > 0) await ingestArticles(articles)
}

export const fetchAndIngestAllSymbols = async (
  symbols:  string[],
  fromDate: string,
): Promise<void> => {
  for (let i = 0; i < symbols.length; i++) {
    await fetchAndIngestSymbolNews(symbols[i], fromDate)

    const isLast = i === symbols.length - 1
    if (!isLast) await sleep(POLYGON_RATE_LIMIT_DELAY)
  }
}
