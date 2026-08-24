// src/types/news.d.ts

export type NewsSentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type NewsCategory = 
  | 'GENERAL' 
  | 'TECH' 
  | 'MARKETS' 
  | 'EARNINGS' 
  | 'ANALYST' 
  | 'FILING' 
  | 'MERGER' 
  | 'MACRO' 
  | 'SECTOR';

export interface NewsArticle {
  id: string;
  headline: string;
  summaryBullets: string[];
  source: string;
  url: string;
  imageUrl: string;
  publishedAt: string;
  category: NewsCategory;
  sentiment: NewsSentiment;
  sentimentScore: number;
  relatedSymbols: string[];
  sector: string | null;
  userContext: {
    inPortfolio: boolean;
    inWatchlist: boolean;
  };
  isRead: boolean;
  isSaved: boolean;
  savedAt?: string;
  _rank?: number;
}

export interface NewsSummaryItem {
  id: string;
  headline: string;
  symbol: string;
  sentiment: NewsSentiment;
  publishedAt: string;
  isRead: boolean;
}

export interface NewsSummary {
  portfolioNews: NewsSummaryItem[];
  watchlistNews: NewsSummaryItem[];
  marketHeadlines: NewsSummaryItem[];
  unreadCount: number;
}

export interface PaginatedNewsResponse {
  data: NewsArticle[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface NewsFeedParams {
  filter?: 'all' | 'portfolio' | 'watchlist' | 'saved';
  category?: string;
  symbol?: string;
  limit?: number;
  cursor?: string;
}

export interface NewsSearchParams extends NewsFeedParams {
  q: string;
  startDate?: string;
  endDate?: string;
}
