import { Controller, Get, Post, Put, Delete, Route, Tags, Security, Body, Path, Query, SuccessResponse, Response } from 'tsoa'
import { ApiResponse, ApiErrorResponse, PaginatedResponse } from './auth.controller'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface WatchlistEntry {
  id: string
  symbol: string
  name?: string
  logoUrl?: string
  sector?: string
  currentPrice?: number
  priceChange?: number
  priceChangePercent?: number
  entryPrice?: number
  targetPrice?: number
  stopLoss?: number
  aiBaselineCalculated: boolean
  addedAt: string
}

export interface AddToWatchlistRequest {
  /** @example "TSLA" */
  symbol: string
}

export interface UpdateWatchlistEntryRequest {
  entryPrice?: number
  targetPrice?: number
  stopLoss?: number
}

export interface Alert {
  id: string
  symbol: string
  type: string
  condition: string
  value?: number | string
  isActive: boolean
  lastTriggered?: string
  createdAt: string
}

export type AlertType =
  | 'PRICE_ABOVE'
  | 'PRICE_BELOW'
  | 'PERCENT_CHANGE_UP'
  | 'PERCENT_CHANGE_DOWN'
  | 'EARNINGS_DATE'
  | 'DIVIDEND_DATE'
  | 'ANALYST_UPGRADE'
  | 'ANALYST_DOWNGRADE'
  | 'SEC_FILING'
  | 'NEWS_MENTION'
  | 'RSI_OVERBOUGHT'
  | 'RSI_OVERSOLD'

export interface CreateAlertRequest {
  type: AlertType
  /** Numeric threshold (for price/percent alerts) */
  value?: number
  /** Freeform condition description */
  condition?: string
}

export interface ConvertToPositionRequest {
  quantity: number
  avgCost: number
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Route('api/watchlist')
@Tags('Watchlist')
export class WatchlistController extends Controller {
  /**
   * Get the authenticated user's watchlist with current quotes and AI baseline data.
   */
  @Get('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Watchlist returned')
  async getWatchlist(): Promise<ApiResponse<WatchlistEntry[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Add a stock symbol to the authenticated user's watchlist.
   */
  @Post('')
  @Security('bearerAuth')
  @SuccessResponse(201, 'Symbol added to watchlist')
  @Response<ApiErrorResponse>(409, 'Symbol already in watchlist')
  async addToWatchlist(@Body() body: AddToWatchlistRequest): Promise<ApiResponse<WatchlistEntry>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Update entry price, target, or stop-loss for a watchlist symbol.
   */
  @Put('{symbol}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Watchlist entry updated')
  @Response<ApiErrorResponse>(404, 'Symbol not in watchlist')
  async updateEntry(
    @Path() symbol: string,
    @Body() body: UpdateWatchlistEntryRequest,
  ): Promise<ApiResponse<WatchlistEntry>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Remove a symbol from the watchlist.
   */
  @Delete('{symbol}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Symbol removed from watchlist')
  @Response<ApiErrorResponse>(404, 'Symbol not in watchlist')
  async removeFromWatchlist(@Path() symbol: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Trigger AI baseline calculation for a watchlist symbol.
   * Computes suggested entry price, take-profit, and stop-loss from technical analysis.
   */
  @Post('{symbol}/ai-baseline')
  @Security('bearerAuth')
  @SuccessResponse(200, 'AI baseline calculated')
  async calculateAiBaseline(
    @Path() symbol: string,
  ): Promise<ApiResponse<{ entryPrice: number; targetPrice: number; stopLoss: number }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Get all alerts configured for a watchlist symbol.
   */
  @Get('{symbol}/alerts')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Alerts returned')
  async getAlerts(@Path() symbol: string): Promise<ApiResponse<Alert[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Create a new alert for a watchlist symbol.
   * Supports 12 alert types: price thresholds, analyst changes, SEC filings, earnings, dividends, RSI signals, and more.
   */
  @Post('{symbol}/alerts')
  @Security('bearerAuth')
  @SuccessResponse(201, 'Alert created')
  @Response<ApiErrorResponse>(400, 'Invalid alert configuration')
  async createAlert(
    @Path() symbol: string,
    @Body() body: CreateAlertRequest,
  ): Promise<ApiResponse<Alert>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Update an existing alert configuration.
   */
  @Put('{symbol}/alerts/{id}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Alert updated')
  async updateAlert(
    @Path() symbol: string,
    @Path() id: string,
    @Body() body: Partial<CreateAlertRequest>,
  ): Promise<ApiResponse<Alert>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Delete an alert.
   */
  @Delete('{symbol}/alerts/{id}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Alert deleted')
  async deleteAlert(
    @Path() symbol: string,
    @Path() id: string,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }
}
