import { AppError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import type { EnrichedArticle, NewsArticleRow } from './types'

export const enrichArticles = async (
  userId: string,
  articles: NewsArticleRow[],
): Promise<EnrichedArticle[]> => {
  if (articles.length === 0) return []

  const articleIds = articles.map((a) => a.id)

  const [readStates, savedStates, portfolios, watchlistItems] =
    await Promise.all([
      prisma.newsReadState.findMany({
        where: { userId, articleId: { in: articleIds } },
        select: { articleId: true },
      }),
      prisma.newsSavedArticle.findMany({
        where: { userId, articleId: { in: articleIds } },
        select: { articleId: true },
      }),
      prisma.portfolio.findMany({
        where: { userId },
        include: { positions: { select: { symbol: true } } },
      }),
      prisma.watchlist.findMany({
        where: { userId },
        select: { symbol: true },
      }),
    ])

  const readSet = new Set(readStates.map((r) => r.articleId))
  const savedSet = new Set(savedStates.map((s) => s.articleId))
  const portfolioSymbolSet = new Set(
    portfolios.flatMap((p) => p.positions.map((pos) => pos.symbol)),
  )
  const watchlistSymbolSet = new Set(watchlistItems.map((w) => w.symbol))

  return articles.map((article) => ({
    ...article,
    userContext: {
      inPortfolio: article.relatedSymbols.some((s) =>
        portfolioSymbolSet.has(s),
      ),
      inWatchlist: article.relatedSymbols.some((s) =>
        watchlistSymbolSet.has(s),
      ),
    },
    isRead: readSet.has(article.id),
    isSaved: savedSet.has(article.id),
  }))
}

export const rankArticles = (
  articles: NewsArticleRow[],
  portfolioSymbols: Set<string>,
  watchlistSymbols: Set<string>,
  portfolioSectors: Set<string>,
): NewsArticleRow[] => {
  const withRank = articles.map((article) => {
    const syms = article.relatedSymbols

    if (syms.some((s) => portfolioSymbols.has(s)))
      return { ...article, _rank: 1 }
    if (syms.some((s) => watchlistSymbols.has(s)))
      return { ...article, _rank: 2 }
    if (
      article.category === 'SECTOR' &&
      article.sector &&
      portfolioSectors.has(article.sector)
    )
      return { ...article, _rank: 3 }

    return { ...article, _rank: 4 }
  })

  return withRank.sort((a, b) => (a as any)._rank - (b as any)._rank)
}

export const resolveCursor = async (cursor: string): Promise<Date> => {
  const row = await prisma.newsArticle.findUnique({
    where: { id: cursor },
    select: { publishedAt: true },
  })
  if (!row) throw new AppError('Invalid or expired cursor', 400)
  return row.publishedAt
}

export const toDateStr = (date: Date): string =>
  date.toISOString().split('T')[0]

export const daysAgo = (n: number): Date => {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}
