import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Query,
  Request,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from '@tsoa/runtime'
import type { Request as ExpressRequest } from 'express'
import { NewsCategory } from '@prisma/client'
import * as NewsService from './service'
import {
  NewsArticleResponse,
  NewsSummaryResponse,
  PaginatedNews,
} from './types'
import { getUserId } from '../../shared/utils'

export interface NewsFeedEnvelopeResponse extends PaginatedNews {
  success: boolean
  message: string
}

export interface NewsDataResponse<T> {
  success: boolean
  message: string
  data: T
}

export interface SimpleNewsMessageResponse {
  success: boolean
  message: string
}

export interface MarkMultipleReadBody {
  articleIds: string[]
}

export interface MarkReadResult {
  updated: number
  data?: { id: string; isRead: boolean }[]
}

export interface ArticleActionState {
  id: string
  isRead?: boolean
  isSaved?: boolean
}

@Tags('News')
@Route('api/v1/news')
export class NewsController extends Controller {
  /**
   * Get paginated financial news feed filtered by category, symbol, or portfolio/watchlist context.
   */
  @Get('feed')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async getNewsFeed(
    @Request() req: ExpressRequest,
    @Query() cursor?: string,
    @Query() limit?: number,
    @Query() category?: NewsCategory,
    @Query() symbol?: string,
    @Query() filter: 'portfolio' | 'watchlist' | 'all' = 'all',
  ): Promise<NewsFeedEnvelopeResponse> {
    const userId = getUserId(req)
    const result = await NewsService.getNewsFeed(userId, {
      cursor,
      limit: limit ?? 20,
      category,
      symbol: symbol ? symbol.toUpperCase() : undefined,
      filter,
    })
    return {
      success: true,
      message: 'News feed retrieved successfully',
      ...result,
    }
  }

  /**
   * Search news articles by text query, symbol, category, and date range.
   */
  @Get('search')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async searchNews(
    @Request() req: ExpressRequest,
    @Query() q?: string,
    @Query() symbol?: string,
    @Query() category?: NewsCategory,
    @Query() from?: string,
    @Query() to?: string,
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<NewsDataResponse<PaginatedNews>> {
    const userId = getUserId(req)
    const result = await NewsService.searchNews(userId, {
      q,
      symbol: symbol ? symbol.toUpperCase() : undefined,
      category,
      from,
      to,
      cursor,
      limit: limit ?? 20,
    })
    return {
      success: true,
      message: 'News search completed successfully',
      data: result,
    }
  }

  /**
   * Get personalized news summary: portfolio news, watchlist news, top market headlines, and unread count.
   */
  @Get('summary')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async getNewsSummary(
    @Request() req: ExpressRequest,
  ): Promise<NewsDataResponse<NewsSummaryResponse>> {
    const userId = getUserId(req)
    const result = await NewsService.getNewsSummary(userId)
    return {
      success: true,
      message: 'News summary retrieved successfully',
      data: result,
    }
  }

  /**
   * Get user's saved/bookmarked news articles.
   */
  @Get('saved')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async getSavedNews(
    @Request() req: ExpressRequest,
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<NewsDataResponse<PaginatedNews>> {
    const userId = getUserId(req)
    const result = await NewsService.getSavedNews(userId, {
      cursor,
      limit: limit ?? 20,
    })
    return {
      success: true,
      message: 'Saved news retrieved successfully',
      data: result,
    }
  }

  /**
   * Get news articles specific to a stock symbol.
   */
  @Get('symbol/{symbol}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async getNewsBySymbol(
    @Request() req: ExpressRequest,
    @Path() symbol: string,
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<NewsDataResponse<PaginatedNews>> {
    const userId = getUserId(req)
    const upperSymbol = symbol.toUpperCase()
    const result = await NewsService.getNewsBySymbol(userId, upperSymbol, {
      cursor,
      limit: limit ?? 20,
    })
    return {
      success: true,
      message: `News for ${upperSymbol} retrieved successfully`,
      data: result,
    }
  }

  /**
   * Mark all news articles as read for the user.
   */
  @Patch('read-all')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async markAllAsRead(
    @Request() req: ExpressRequest,
  ): Promise<NewsDataResponse<MarkReadResult>> {
    const userId = getUserId(req)
    const result = await NewsService.markAllArticlesAsRead(userId)
    return {
      success: true,
      message: 'All articles marked as read',
      data: result,
    }
  }

  /**
   * Mark multiple news articles as read.
   */
  @Patch('read-multiple')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async markMultipleAsRead(
    @Request() req: ExpressRequest,
    @Body() body: MarkMultipleReadBody,
  ): Promise<NewsDataResponse<MarkReadResult>> {
    const userId = getUserId(req)
    const result = await NewsService.markMultipleArticlesAsRead(
      userId,
      body.articleIds,
    )
    return {
      success: true,
      message: 'Articles marked as read',
      data: result,
    }
  }

  /**
   * Mark a single news article as read.
   */
  @Patch('{id}/read')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async markAsRead(
    @Request() req: ExpressRequest,
    @Path() id: string,
  ): Promise<NewsDataResponse<ArticleActionState>> {
    const userId = getUserId(req)
    const result = await NewsService.markArticleAsRead(userId, id)
    return {
      success: true,
      message: 'Article marked as read',
      data: result,
    }
  }

  /**
   * Save/bookmark a news article.
   */
  @Post('{id}/save')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async saveArticle(
    @Request() req: ExpressRequest,
    @Path() id: string,
  ): Promise<NewsDataResponse<ArticleActionState>> {
    const userId = getUserId(req)
    const result = await NewsService.saveArticle(userId, id)
    return {
      success: true,
      message: 'Article saved',
      data: result,
    }
  }

  /**
   * Unsave/remove bookmark from a news article.
   */
  @Delete('{id}/save')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async unsaveArticle(
    @Request() req: ExpressRequest,
    @Path() id: string,
  ): Promise<SimpleNewsMessageResponse> {
    const userId = getUserId(req)
    await NewsService.unsaveArticle(userId, id)
    return {
      success: true,
      message: 'Article removed from saved',
    }
  }
}
