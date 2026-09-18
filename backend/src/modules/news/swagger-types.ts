import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Route,
  Tags,
  Security,
  Body,
  Path,
  Query,
  SuccessResponse,
  Response,
} from 'tsoa'
import { ApiResponse, ApiErrorResponse } from '../../shared/docs-types'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface NewsArticle {
  id: string
  headline: string
  url: string
  imageUrl?: string
  source: string
  publishedAt: string
  relatedSymbols: string[]
  /** @enum {string} */
  sentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  /** @enum {string} */
  category:
    | 'EARNINGS'
    | 'ANALYST'
    | 'FILING'
    | 'MERGER'
    | 'MACRO'
    | 'SECTOR'
    | 'GENERAL'
  isRead: boolean
  isSaved: boolean
}

export interface MarkMultipleNewsReadRequest {
  articleIds: string[]
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/v1/news')
@Tags('News')
export class NewsSwaggerController extends Controller {
  /**
   * Fetch a cursor-paginated news feed, filterable by portfolio/watchlist/all, symbol,
   * category, and date range.
   */
  @Get('feed')
  @Security('bearerAuth')
  @SuccessResponse(200, 'News feed retrieved successfully')
  async getNewsFeed(
    @Query() cursor?: string,
    @Query() limit?: number,
    @Query() category?: string,
    @Query() symbol?: string,
    @Query() filter?: 'portfolio' | 'watchlist' | 'all',
    @Query() from?: string,
    @Query() to?: string,
  ): Promise<ApiResponse<NewsArticle[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Full-text search across news articles, with the same filters as the feed.
   */
  @Get('search')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Search results retrieved successfully')
  async searchNews(
    @Query() q?: string,
    @Query() symbol?: string,
    @Query() category?: string,
    @Query() from?: string,
    @Query() to?: string,
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<ApiResponse<NewsArticle[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Get unread-count and category-breakdown summary for the authenticated user.
   */
  @Get('summary')
  @Security('bearerAuth')
  @SuccessResponse(200, 'News summary retrieved successfully')
  async getNewsSummary(): Promise<ApiResponse<unknown>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Fetch all articles the authenticated user has saved/bookmarked.
   */
  @Get('saved')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Saved articles retrieved successfully')
  async getSavedNews(
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<ApiResponse<NewsArticle[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Fetch news for a specific symbol.
   */
  @Get('symbol/{symbol}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'News for symbol retrieved successfully')
  async getNewsBySymbol(
    @Path() symbol: string,
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<ApiResponse<NewsArticle[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Mark all unread articles as read for the authenticated user.
   */
  @Patch('read-all')
  @Security('bearerAuth')
  @SuccessResponse(200, 'All articles marked as read')
  async markAllAsRead(): Promise<ApiResponse<{ count: number }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Mark a specific set of articles as read.
   */
  @Patch('read-multiple')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Articles marked as read')
  async markMultipleAsRead(
    @Body() body: MarkMultipleNewsReadRequest,
  ): Promise<ApiResponse<{ count: number }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Mark a single news article as read.
   */
  @Patch('{id}/read')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Article marked as read')
  @Response<ApiErrorResponse>(404, 'Article not found')
  async markAsRead(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Save/bookmark a news article.
   */
  @Post('{id}/save')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Article saved')
  @Response<ApiErrorResponse>(404, 'Article not found')
  async saveArticle(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Remove a saved article from the user's saved list.
   */
  @Delete('{id}/save')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Article removed from saved')
  @Response<ApiErrorResponse>(404, 'Article not found')
  async unsaveArticle(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }
}
