import type { NewsCategory, NewsSentiment } from '@prisma/client'

export interface NewsArticleRow {
  id: string
  headline: string
  summaryBullets: string[]
  source: string
  url: string
  imageUrl: string | null
  publishedAt: Date
  category: NewsCategory
  sentiment: NewsSentiment | null
  sentimentScore: number | null
  relatedSymbols: string[]
  sector?: string | null
}

export interface EnrichedArticle extends NewsArticleRow {
  userContext: { inPortfolio: boolean; inWatchlist: boolean }
  isRead: boolean
  isSaved: boolean
}

export interface NormalisedArticle {
  url: string
  headline: string
  rawSummary: string
  source: string
  imageUrl: string | null
  publishedAt: Date
  category: NewsCategory
  sentiment: NewsSentiment | null
  sentimentScore: number | null
  relatedSymbols: string[]
  sector: string | null
}

export interface NewsArticleResponse extends EnrichedArticle {}

export interface PaginatedNews {
  data: NewsArticleResponse[]
  nextCursor: string | null
  hasMore: boolean
}

export interface NewsSummaryResponse {
  portfolioNews: {
    id: string
    headline: string
    symbol: string | null
    sentiment: NewsSentiment | null
    publishedAt: Date
    isRead: boolean
  }[]
  watchlistNews: {
    id: string
    headline: string
    symbol: string | null
    sentiment: NewsSentiment | null
    publishedAt: Date
    isRead: boolean
  }[]
  marketHeadlines: {
    id: string
    headline: string
    symbol: string | null
    sentiment: NewsSentiment | null
    publishedAt: Date
    isRead: boolean
  }[]
  unreadCount: number
}
