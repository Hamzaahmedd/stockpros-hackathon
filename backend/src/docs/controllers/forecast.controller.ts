import { Controller, Get, Post, Route, Tags, Security, Body, Path, Query, SuccessResponse, Response } from 'tsoa'
import { ApiResponse, ApiErrorResponse } from './auth.controller'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface ForecastRequest {
  /** @example "AAPL" */
  symbol: string
  /** Forecast horizon in days @example 30 */
  days?: number
}

export interface ForecastDataPoint {
  /** @format date @example "2024-02-15" */
  date: string
  /** Predicted closing price */
  predicted: number
  /** Lower confidence bound */
  lower?: number
  /** Upper confidence bound */
  upper?: number
}

export interface ForecastMetrics {
  mse: number
  rmse: number
  mae: number
  r2?: number
}

export interface ForecastResult {
  symbol: string
  model: 'GRU'
  horizon: number
  forecasts: ForecastDataPoint[]
  metrics: ForecastMetrics
  generatedAt: string
  /** Cached result — true if served from Redis */
  cached: boolean
}

export interface ForecastHistoryRecord {
  id: string
  symbol: string
  horizon: number
  generatedAt: string
  metrics: ForecastMetrics
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Route('api/forecast')
@Tags('AI Forecast')
export class ForecastController extends Controller {
  /**
   * Generate a GRU-based time-series stock price forecast.
   * Delegates to the Python AI Service which trains/loads a GRU model on Tiingo OHLCV data.
   * Results are cached in Redis to avoid redundant inference.
   */
  @Post('predict')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Forecast generated successfully')
  @Response<ApiErrorResponse>(400, 'Invalid symbol or horizon')
  @Response<ApiErrorResponse>(503, 'AI service unavailable')
  async predict(@Body() body: ForecastRequest): Promise<ApiResponse<ForecastResult>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Retrieve paginated forecast history for the authenticated user.
   */
  @Get('history')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Forecast history returned')
  async getHistory(
    @Query() page?: number,
    @Query() limit?: number,
  ): Promise<ApiResponse<{ items: ForecastHistoryRecord[]; total: number }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Fetch a single historical forecast record by ID.
   */
  @Get('history/{id}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Forecast record returned')
  @Response<ApiErrorResponse>(404, 'Not found')
  async getHistoryById(@Path() id: string): Promise<ApiResponse<ForecastResult>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Delete a forecast history record.
   */
  @Get('{id}/export/csv')
  @Security('bearerAuth')
  @SuccessResponse(200, 'CSV file returned')
  async exportCsv(@Path() id: string): Promise<void> {
    throw new Error('tsoa spec-only')
  }
}
