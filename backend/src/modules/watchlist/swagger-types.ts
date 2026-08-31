import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Route,
  Tags,
  Security,
  Body,
  Path,
  SuccessResponse,
  Response,
} from 'tsoa'
import { ApiResponse, ApiErrorResponse } from '../../shared/docs-types'

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
  targetEntryPrice?: number
  stopLoss?: number
  notes?: string
  priceAtCreatedAt?: number
  aiSuggestedEntry?: number
  aiTakeProfit?: number
  aiStopLoss?: number
  /** @enum {string} */
  aiConfidence?: 'LOW' | 'MEDIUM' | 'HIGH'
  aiSuggestionBasis?: string
  aiComputedAt?: string
  createdAt: string
}

export interface AddToWatchlistRequest {
  /** @example "TSLA" */
  symbol: string
  targetEntryPrice?: number
  stopLoss?: number
  /** @maxLength 500 */
  notes?: string
}

export interface UpdateWatchlistEntryRequest {
  targetEntryPrice?: number
  stopLoss?: number
  /** @maxLength 500 */
  notes?: string
}

export interface WatchlistAlert {
  id: string
  watchlistId: string
  /** @enum {string} */
  type:
    | 'PRICE_ABOVE'
    | 'PRICE_BELOW'
    | 'PCT_CHANGE_UP'
    | 'PCT_CHANGE_DOWN'
    | 'ENTRY_ZONE'
    | 'STOP_LOSS_BREACHED'
    | 'EARNINGS_APPROACHING'
    | 'DIVIDEND_APPROACHING'
    | 'ANALYST_RATING_CHANGE'
    | 'NEWS_PUBLISHED'
    | 'SEC_FILING'
    | 'AI_SIGNAL_CHANGED'
  threshold?: number
  isActive: boolean
  createdAt: string
}

export interface CreateAlertRequest {
  /** @enum {string} */
  type:
    | 'PRICE_ABOVE'
    | 'PRICE_BELOW'
    | 'PCT_CHANGE_UP'
    | 'PCT_CHANGE_DOWN'
    | 'ENTRY_ZONE'
    | 'STOP_LOSS_BREACHED'
    | 'EARNINGS_APPROACHING'
    | 'DIVIDEND_APPROACHING'
    | 'ANALYST_RATING_CHANGE'
    | 'NEWS_PUBLISHED'
    | 'SEC_FILING'
    | 'AI_SIGNAL_CHANGED'
  /** Numeric threshold (for price/percent alerts) */
  threshold?: number
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/watchlist')
@Tags('Watchlist')
export class WatchlistSwaggerController extends Controller {
  /**
   * Get the authenticated user's watchlist with current quotes and AI suggestion data.
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
  async addToWatchlist(
    @Body() body: AddToWatchlistRequest,
  ): Promise<ApiResponse<WatchlistEntry>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Update trade plan fields (target entry, stop-loss, notes) for a watchlist symbol.
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
   * Trigger AI suggestion calculation for a watchlist symbol.
   * Computes suggested entry price, take-profit, and stop-loss from technical analysis.
   */
  @Post('{symbol}/ai-baseline')
  @Security('bearerAuth')
  @SuccessResponse(200, 'AI suggestions calculated')
  async calculateAiBaseline(@Path() symbol: string): Promise<
    ApiResponse<{
      aiSuggestedEntry: number
      aiTakeProfit: number
      aiStopLoss: number
      aiConfidence: 'LOW' | 'MEDIUM' | 'HIGH'
    }>
  > {
    throw new Error('tsoa spec-only')
  }

  /**
   * Get all alerts configured for a watchlist symbol.
   */
  @Get('{symbol}/alerts')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Alerts returned')
  async getAlerts(
    @Path() symbol: string,
  ): Promise<ApiResponse<WatchlistAlert[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Create a new alert for a watchlist symbol.
   * Supports 12 alert types: price thresholds, analyst changes, SEC filings, earnings, dividends, and AI signals.
   */
  @Post('{symbol}/alerts')
  @Security('bearerAuth')
  @SuccessResponse(201, 'Alert created')
  @Response<ApiErrorResponse>(400, 'Invalid alert configuration')
  async createAlert(
    @Path() symbol: string,
    @Body() body: CreateAlertRequest,
  ): Promise<ApiResponse<WatchlistAlert>> {
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
  ): Promise<ApiResponse<WatchlistAlert>> {
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
