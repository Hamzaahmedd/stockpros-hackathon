import { Controller, Get, Post, Delete, Put, Route, Tags, Security, Body, Path, Query, SuccessResponse, Response } from 'tsoa'
import { ApiResponse, ApiErrorResponse, PaginatedResponse } from './auth.controller'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface NewsArticle {
  id: string
  title: string
  summary: string
  url: string
  imageUrl?: string
  source: string
  publishedAt: string
  symbols: string[]
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  sentimentScore: number
  category: string
  isRead: boolean
  isBookmarked: boolean
}

export interface NewsQueryParams {
  /** Filter by stock symbol @example "AAPL" */
  symbol?: string
  /** Filter by sentiment */
  sentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  /** Filter by category */
  category?: string
  /** Full-text search query */
  q?: string
  page?: number
  limit?: number
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Route('api/news')
@Tags('News')
export class NewsController extends Controller {
  /**
   * Fetch a paginated list of financial news articles.
   * Supports filtering by symbol, sentiment, category, and full-text search.
   */
  @Get('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'News articles returned')
  async getNews(
    @Query() symbol?: string,
    @Query() sentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
    @Query() category?: string,
    @Query() q?: string,
    @Query() page?: number,
    @Query() limit?: number,
  ): Promise<PaginatedResponse<NewsArticle>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Mark a news article as read for the authenticated user.
   */
  @Post('{id}/read')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Article marked as read')
  @Response<ApiErrorResponse>(404, 'Article not found')
  async markRead(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Toggle bookmark status of a news article.
   */
  @Post('{id}/bookmark')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Bookmark toggled')
  @Response<ApiErrorResponse>(404, 'Article not found')
  async toggleBookmark(@Path() id: string): Promise<ApiResponse<{ bookmarked: boolean }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Fetch all bookmarked articles for the authenticated user.
   */
  @Get('bookmarks')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Bookmarked articles returned')
  async getBookmarks(
    @Query() page?: number,
    @Query() limit?: number,
  ): Promise<PaginatedResponse<NewsArticle>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Mark all unread articles as read.
   */
  @Post('mark-all-read')
  @Security('bearerAuth')
  @SuccessResponse(200, 'All articles marked as read')
  async markAllRead(): Promise<ApiResponse<{ count: number }>> {
    throw new Error('tsoa spec-only')
  }
}
