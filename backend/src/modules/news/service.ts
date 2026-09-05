import { NEWS_CACHE_TTL_SECONDS, SUMMARY_MAX_ITEMS } from './constants'
import { AppError } from '../../shared/errors'
import { resolveCursor, rankArticles, enrichArticles } from './news'
import type { NewsSentiment } from '@prisma/client'
import type {
  NewsArticleResponse,
  PaginatedNews,
  NewsSummaryResponse,
} from './types'
import { prisma } from '../../shared/infrastructure/database'
import { getCache, setCache } from '../../shared/infrastructure/cache'
import type {
  NewsFeedQuery,
  NewsSymbolQuery,
  NewsSearchQuery,
  NewsSavedQuery,
} from './validation'

export const feedCacheKey = (params: {
  category?: string
  cursor?: string
  limit: number
}): string => {
  const cat = params.category ?? 'all'
  const cursor = params.cursor ?? 'start'
  return `news:feed:all:cat:${cat}:cursor:${cursor}:limit:${params.limit}`
}

export const symbolCacheKey = (params: {
  symbol: string
  cursor?: string
  limit: number
}): string => {
  const cursor = params.cursor ?? 'start'
  return `news:symbol:${params.symbol}:cursor:${cursor}:limit:${params.limit}`
}
const articleSelect = {
  id: true,
  headline: true,
  summaryBullets: true,
  source: true,
  url: true,
  imageUrl: true,
  publishedAt: true,
  category: true,
  sentiment: true,
  sentimentScore: true,
  relatedSymbols: true,
  sector: true,
} as const

const cursorWhere = (cursorDate: Date, cursor: string) => ({
  OR: [
    { publishedAt: { lt: cursorDate } },
    { publishedAt: cursorDate, id: { lt: cursor } },
  ],
})

const resolveFilterSymbols = (
  filter?: string,
  symbol?: string,
  portfolioSymbols?: Set<string>,
  watchlistSymbols?: Set<string>,
): string[] | undefined => {
  if (symbol) return [symbol]
  if (filter === 'portfolio')
    return portfolioSymbols ? Array.from(portfolioSymbols) : []
  if (filter === 'watchlist')
    return watchlistSymbols ? Array.from(watchlistSymbols) : []
  return undefined
}

export const getNewsFeed = async (
  userId: string,
  query: NewsFeedQuery,
): Promise<PaginatedNews> => {
  const { cursor, limit, category, filter, symbol, from, to } = query

  if (filter === 'all' && !symbol && !from && !to) {
    const key = feedCacheKey({ category, cursor, limit })
    const cached = await getCache<PaginatedNews>(key)
    if (cached) return cached
  }

  let cursorDate: Date | undefined
  if (cursor) cursorDate = await resolveCursor(cursor)

  const [portfolios, watchlistItems] = await Promise.all([
    prisma.portfolio.findMany({
      where: { userId },
      include: { positions: { select: { symbol: true, sector: true } } },
    }),
    prisma.watchlist.findMany({ where: { userId }, select: { symbol: true } }),
  ])

  const portfolioSymbols = new Set(
    portfolios.flatMap((p) => p.positions.map((pos) => pos.symbol)),
  )
  const watchlistSymbols = new Set(watchlistItems.map((w) => w.symbol))
  const portfolioSectors = new Set(
    portfolios
      .flatMap((p) => p.positions.map((pos) => pos.sector))
      .filter((s): s is string => s !== null),
  )

  const symbolFilter = resolveFilterSymbols(
    filter,
    symbol,
    portfolioSymbols,
    watchlistSymbols,
  )
  if (symbolFilter?.length === 0) {
    return { data: [], nextCursor: null, hasMore: false }
  }

  const rows = await prisma.newsArticle.findMany({
    where: {
      ...(category && { category }),
      ...(symbolFilter && { relatedSymbols: { hasSome: symbolFilter } }),
      ...(from && { publishedAt: { gte: new Date(from) } }),
      ...(to && { publishedAt: { lte: new Date(to) } }),
      ...(cursorDate && cursorWhere(cursorDate, cursor!)),
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: articleSelect,
  })

  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? (pageRows.at(-1)?.id ?? null) : null

  const ranked =
    filter === 'all'
      ? rankArticles(
          pageRows,
          portfolioSymbols,
          watchlistSymbols,
          portfolioSectors,
        )
      : pageRows
  const enriched = await enrichArticles(userId, ranked)
  const result = { data: enriched, nextCursor, hasMore }

  if (filter === 'all') {
    await setCache(
      feedCacheKey({ category, cursor, limit }),
      result,
      NEWS_CACHE_TTL_SECONDS,
    )
  }

  return result
}

export const getNewsBySymbol = async (
  userId: string,
  symbol: string,
  query: NewsSymbolQuery,
): Promise<PaginatedNews> => {
  const { cursor, limit } = query
  const key = symbolCacheKey({ symbol, cursor, limit })
  const cached = await getCache<PaginatedNews>(key)
  if (cached) return cached

  let cursorDate: Date | undefined
  if (cursor) cursorDate = await resolveCursor(cursor)

  const rows = await prisma.newsArticle.findMany({
    where: {
      relatedSymbols: { has: symbol },
      ...(cursorDate && cursorWhere(cursorDate, cursor!)),
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: articleSelect,
  })

  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? (pageRows.at(-1)?.id ?? null) : null
  const enriched = await enrichArticles(userId, pageRows)
  const result = { data: enriched, nextCursor, hasMore }

  await setCache(key, result, NEWS_CACHE_TTL_SECONDS)
  return result
}

export const searchNews = async (
  userId: string,
  query: NewsSearchQuery,
): Promise<PaginatedNews> => {
  const { q, symbol, category, from, to, cursor, limit } = query

  let cursorDate: Date | undefined
  if (cursor) cursorDate = await resolveCursor(cursor)

  const rows = await prisma.newsArticle.findMany({
    where: {
      ...(q && { headline: { contains: q, mode: 'insensitive' } }),
      ...(category && { category }),
      ...(symbol && { relatedSymbols: { has: symbol } }),
      ...(from && { publishedAt: { gte: new Date(from) } }),
      ...(to && { publishedAt: { lte: new Date(to) } }),
      ...(cursorDate && cursorWhere(cursorDate, cursor!)),
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: articleSelect,
  })

  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? (pageRows.at(-1)?.id ?? null) : null
  const enriched = await enrichArticles(userId, pageRows)

  return { data: enriched, nextCursor, hasMore }
}

export const getNewsSummary = async (
  userId: string,
): Promise<NewsSummaryResponse> => {
  const [portfolios, watchlistItems, readStates] = await Promise.all([
    prisma.portfolio.findMany({
      where: { userId },
      include: { positions: { select: { symbol: true } } },
    }),
    prisma.watchlist.findMany({ where: { userId }, select: { symbol: true } }),
    prisma.newsReadState.findMany({
      where: { userId },
      select: { articleId: true },
    }),
  ])

  const portfolioSymbols = portfolios.flatMap((p) =>
    p.positions.map((pos) => pos.symbol),
  )
  const watchlistSymbols = watchlistItems.map((w) => w.symbol)
  const readSet = new Set(readStates.map((r) => r.articleId))

  const summarySelect = {
    id: true,
    headline: true,
    relatedSymbols: true,
    sentiment: true,
    publishedAt: true,
  } as const

  const [portfolioNews, watchlistNews, marketHeadlines, unreadCount] =
    await Promise.all([
      portfolioSymbols.length > 0
        ? prisma.newsArticle.findMany({
            where: { relatedSymbols: { hasSome: portfolioSymbols } },
            orderBy: { publishedAt: 'desc' },
            take: SUMMARY_MAX_ITEMS,
            select: summarySelect,
          })
        : [],
      watchlistSymbols.length > 0
        ? prisma.newsArticle.findMany({
            where: { relatedSymbols: { hasSome: watchlistSymbols } },
            orderBy: { publishedAt: 'desc' },
            take: SUMMARY_MAX_ITEMS,
            select: summarySelect,
          })
        : [],
      prisma.newsArticle.findMany({
        where: { category: 'GENERAL' },
        orderBy: { publishedAt: 'desc' },
        take: SUMMARY_MAX_ITEMS * 3,
        select: summarySelect,
      }),
      prisma.newsArticle.count({ where: { readStates: { none: { userId } } } }),
    ])

  const toItem = (
    article: {
      id: string
      headline: string
      relatedSymbols: string[]
      sentiment: NewsSentiment | null
      publishedAt: Date
    },
    matchSymbols: string[],
  ) => ({
    id: article.id,
    headline: article.headline,
    symbol:
      matchSymbols.find((s) => article.relatedSymbols.includes(s)) ??
      article.relatedSymbols[0] ??
      null,
    sentiment: article.sentiment,
    publishedAt: article.publishedAt,
    isRead: readSet.has(article.id),
  })

  const portfolioAndWatchlistIds = new Set([
    ...portfolioNews.map((a) => a.id),
    ...watchlistNews.map((a) => a.id),
  ])

  const filteredHeadlines = marketHeadlines
    .filter((a) => !portfolioAndWatchlistIds.has(a.id))
    .slice(0, SUMMARY_MAX_ITEMS)

  return {
    portfolioNews: portfolioNews.map((a) => toItem(a, portfolioSymbols)),
    watchlistNews: watchlistNews.map((a) => toItem(a, watchlistSymbols)),
    marketHeadlines: filteredHeadlines.map((a) => toItem(a, [])),
    unreadCount,
  }
}

export const getSavedNews = async (
  userId: string,
  query: NewsSavedQuery,
): Promise<
  PaginatedNews & { data: (NewsArticleResponse & { savedAt: Date })[] }
> => {
  const { cursor, limit } = query

  let cursorSavedAt: Date | undefined
  if (cursor) {
    const row = await prisma.newsSavedArticle.findFirst({
      where: { userId, articleId: cursor },
      select: { savedAt: true },
    })
    if (!row) throw new AppError('Invalid or expired cursor', 400)
    cursorSavedAt = row.savedAt
  }

  const savedRows = await prisma.newsSavedArticle.findMany({
    where: {
      userId,
      ...(cursorSavedAt && {
        OR: [
          { savedAt: { lt: cursorSavedAt } },
          { savedAt: cursorSavedAt, articleId: { lt: cursor } },
        ],
      }),
    },
    orderBy: [{ savedAt: 'desc' }, { articleId: 'desc' }],
    take: limit + 1,
    include: { article: { select: articleSelect } },
  })

  const hasMore = savedRows.length > limit
  const pageRows = hasMore ? savedRows.slice(0, limit) : savedRows
  const nextCursor = hasMore ? (pageRows.at(-1)?.articleId ?? null) : null
  const enriched = await enrichArticles(
    userId,
    pageRows.map((r) => r.article),
  )

  return {
    data: enriched.map((article, i) => ({
      ...article,
      savedAt: pageRows[i].savedAt,
      isSaved: true,
    })),
    nextCursor,
    hasMore,
  }
}

export const markArticleAsRead = async (
  userId: string,
  articleId: string,
): Promise<{ id: string; isRead: boolean }> => {
  const article = await prisma.newsArticle.findUnique({
    where: { id: articleId },
  })
  if (!article) throw new AppError('Article not found', 404)

  await prisma.newsReadState.upsert({
    where: { userId_articleId: { userId, articleId } },
    update: {},
    create: { userId, articleId },
  })

  return { id: articleId, isRead: true }
}

export const markMultipleArticlesAsRead = async (
  userId: string,
  articleIds: string[],
): Promise<{ updated: number; data: { id: string; isRead: boolean }[] }> => {
  const data = articleIds.map((id) => ({ userId, articleId: id }))

  const result = await prisma.newsReadState.createMany({
    data,
    skipDuplicates: true,
  })

  return {
    updated: result.count,
    data: articleIds.map((id) => ({ id, isRead: true })),
  }
}

export const markAllArticlesAsRead = async (
  userId: string,
): Promise<{ updated: number }> => {
  const unreadArticles = await prisma.newsArticle.findMany({
    where: {
      readStates: {
        none: { userId },
      },
    },
    select: { id: true },
  })

  if (unreadArticles.length === 0) {
    return { updated: 0 }
  }

  const data = unreadArticles.map((a) => ({ userId, articleId: a.id }))

  const result = await prisma.newsReadState.createMany({
    data,
    skipDuplicates: true,
  })

  return { updated: result.count }
}

export const saveArticle = async (
  userId: string,
  articleId: string,
): Promise<{ id: string; isSaved: boolean }> => {
  const article = await prisma.newsArticle.findUnique({
    where: { id: articleId },
  })
  if (!article) throw new AppError('Article not found', 404)

  await prisma.newsSavedArticle.upsert({
    where: { userId_articleId: { userId, articleId } },
    update: {},
    create: { userId, articleId },
  })

  return { id: articleId, isSaved: true }
}

export const unsaveArticle = async (
  userId: string,
  articleId: string,
): Promise<{ id: string; isSaved: boolean }> => {
  const existing = await prisma.newsSavedArticle.findUnique({
    where: { userId_articleId: { userId, articleId } },
  })
  if (!existing) throw new AppError('Article not found in saved list', 404)

  await prisma.newsSavedArticle.delete({
    where: { userId_articleId: { userId, articleId } },
  })

  return { id: articleId, isSaved: false }
}
