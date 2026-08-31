import { Controller, Get, Post, Route, Tags, Security, Body, Path, Query, SuccessResponse, Response } from 'tsoa'
import { ApiResponse, ApiErrorResponse } from './auth.controller'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface StockQuote {
  /** Current price */
  c: number
  /** Change */
  d: number
  /** Percent change */
  dp: number
  /** High price of the day */
  h: number
  /** Low price of the day */
  l: number
  /** Open price of the day */
  o: number
  /** Previous close price */
  pc: number
  /** Unix timestamp */
  t: number
  /** Volume */
  v?: number
}

export interface RankedStock {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap?: number
  sector?: string
  logoUrl?: string
  rank: number
}

export interface LivePriceEntry {
  symbol: string
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  open: number
  previousClose: number
}

export interface CompanySector {
  symbol: string
  sector: string
  industry?: string
  name?: string
}

export interface LogoResponse {
  symbol: string
  logoUrl: string | null
}

export interface GetLivePricesRequest {
  symbols: string[]
}

export interface GetLogosBatchRequest {
  symbols: string[]
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Route('api/market')
@Tags('Market Data')
export class MarketController extends Controller {
  /**
   * Get ranked top US stocks ordered by a composite score (volume, momentum, market cap).
   * Results are cached for performance.
   * @param limit Number of stocks to return (1–100)
   */
  @Get('top-stocks')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Top stocks returned')
  async getTopStocks(
    @Query() limit?: number,
  ): Promise<ApiResponse<RankedStock[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Fetch live quote snapshots for a batch of symbols.
   * Pulls from the in-memory PriceCache (updated via Finnhub WebSocket) with Yahoo Finance fallback.
   */
  @Post('live-prices')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Live prices returned')
  @Response<ApiErrorResponse>(400, 'No symbols provided')
  async getLivePrices(@Body() body: GetLivePricesRequest): Promise<ApiResponse<LivePriceEntry[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Resolve company sectors and industry classification for a list of symbols.
   */
  @Post('company-sectors')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Sectors returned')
  async getCompanySectors(@Body() body: { symbols: string[] }): Promise<ApiResponse<CompanySector[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Fetch cached logo URLs for a batch of symbols. Missing logos fall back to Clearbit.
   */
  @Post('logos')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Logos returned')
  async getLogos(@Body() body: GetLogosBatchRequest): Promise<ApiResponse<LogoResponse[]>> {
    throw new Error('tsoa spec-only')
  }
}
