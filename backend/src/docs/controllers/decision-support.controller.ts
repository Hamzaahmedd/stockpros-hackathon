import { Controller, Get, Post, Delete, Route, Tags, Security, Body, Path, Query, SuccessResponse, Response, FormField, UploadedFile } from 'tsoa'
import { ApiResponse, ApiErrorResponse, PaginatedResponse } from './auth.controller'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface DecisionResult {
  symbol: string
  action: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  summary: string
  factors: DecisionFactor[]
  priceTarget?: number
  stopLoss?: number
  timestamp: string
}

export interface DecisionFactor {
  name: string
  value: string | number
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  weight: number
}

export interface RunDecisionRequest {
  symbol: string
  /** Snapshot of user holdings for exposure analysis */
  portfolio?: PortfolioPosition[]
}

export interface PortfolioPosition {
  symbol: string
  quantity: number
  avgCost: number
}

export interface DecisionRunRecord {
  id: string
  symbol: string
  action: string
  confidence: number
  riskLevel: string
  createdAt: string
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Route('api/decision-support')
@Tags('Decision Support')
export class DecisionSupportController extends Controller {
  /**
   * Run the full multi-factor decision engine for a single symbol.
   * Combines technical indicators (RSI, Bollinger Bands), analyst ratings, news sentiment,
   * earnings data, and portfolio exposure to produce a BUY/SELL/HOLD recommendation.
   */
  @Post('run')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Decision analysis complete')
  @Response<ApiErrorResponse>(400, 'Invalid symbol')
  async runDecision(@Body() body: RunDecisionRequest): Promise<ApiResponse<DecisionResult>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Upload a portfolio CSV or XLSX file for batch exposure analysis.
   * Accepted columns: symbol, quantity, avgCost.
   */
  @Post('portfolio/upload')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Portfolio uploaded and parsed')
  @Response<ApiErrorResponse>(400, 'Unsupported file format')
  async uploadPortfolio(): Promise<ApiResponse<{ positions: PortfolioPosition[] }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Fetch paginated history of decision runs for the authenticated user.
   */
  @Get('history')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Decision history returned')
  async getHistory(
    @Query() page?: number,
    @Query() limit?: number,
  ): Promise<PaginatedResponse<DecisionRunRecord>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Delete a specific decision run record.
   */
  @Delete('history/{id}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Decision run deleted')
  @Response<ApiErrorResponse>(404, 'Record not found')
  async deleteHistory(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }
}
