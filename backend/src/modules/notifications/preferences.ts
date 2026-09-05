import { NewsCategory } from '@prisma/client'

export const MARKET_INTERESTS = [
  'ai_tech',
  'energy',
  'finance',
  'healthcare',
  'growth',
  'consumer',
] as const

export type MarketInterest = (typeof MARKET_INTERESTS)[number]

/**
 * Maps each user-selectable market interest to the NewsCategory values and
 * free-text sector strings stored on NewsArticle rows.
 * Used to boost supplementary news in the pre-market digest when a user has
 * fewer watchlist-symbol articles than the digest article cap.
 */
export const INTEREST_TO_CATEGORIES: Record<
  MarketInterest,
  { categories: NewsCategory[]; sectors: string[] }
> = {
  ai_tech: {
    categories: [NewsCategory.ANALYST, NewsCategory.MERGER, NewsCategory.GENERAL],
    sectors: ['technology', 'tech', 'artificial intelligence', 'semiconductors'],
  },
  energy: {
    categories: [NewsCategory.MACRO, NewsCategory.SECTOR, NewsCategory.GENERAL],
    sectors: ['energy', 'oil', 'gas', 'utilities', 'renewables'],
  },
  finance: {
    categories: [NewsCategory.EARNINGS, NewsCategory.ANALYST, NewsCategory.FILING],
    sectors: ['financials', 'banking', 'insurance', 'fintech'],
  },
  healthcare: {
    categories: [NewsCategory.EARNINGS, NewsCategory.ANALYST, NewsCategory.GENERAL],
    sectors: ['healthcare', 'biotech', 'pharmaceuticals', 'medical'],
  },
  growth: {
    categories: [NewsCategory.EARNINGS, NewsCategory.ANALYST, NewsCategory.MERGER],
    sectors: ['technology', 'consumer discretionary', 'communication services'],
  },
  consumer: {
    categories: [NewsCategory.EARNINGS, NewsCategory.GENERAL, NewsCategory.SECTOR],
    sectors: ['consumer staples', 'consumer discretionary', 'retail'],
  },
}
