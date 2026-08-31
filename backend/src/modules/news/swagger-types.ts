import {
  Controller,
  Get,
  Post,
  Delete,
  Route,
  Tags,
  Security,
  Path,
  Query,
  SuccessResponse,
  Response,
} from 'tsoa'
import {
  ApiResponse,
  ApiErrorResponse,
  PaginatedResponse,
} from '../../shared/docs-types'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface NewsArticle {
  id: string
  headline: string
  summaryBullets: string[]
  url: string
  imageUrl?: string
  source: string
  publishedAt: string
  relatedSymbols: string[]
  /** @enum {string} */
  sentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  sentimentScore?: number
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

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/news')
@Tags('News')
export class NewsSwaggerController extends Controller {
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
   * Save or unsave a news article (toggle bookmark).
   */
  @Post('{id}/save')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Save state toggled')
  @Response<ApiErrorResponse>(404, 'Article not found')
  async toggleSave(
    @Path() id: string,
  ): Promise<ApiResponse<{ saved: boolean }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Fetch all saved articles for the authenticated user.
   */
  @Get('saved')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Saved articles returned')
  async getSaved(
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

  /**
   * Remove a saved article from the user's saved list.
   */
  @Delete('{id}/save')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Article unsaved')
  @Response<ApiErrorResponse>(404, 'Article not found')
  async unsave(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }
}
