import { Controller, Get, Post, Route, Tags, Security, Query, SuccessResponse } from 'tsoa'
import { ApiResponse } from '../../shared/docs-types'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface ForecastDataPoint {
  /** @format date @example "2024-02-15" */
  date: string
  /** Predicted closing price */
  predicted: number
  lower?: number
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
  forecasts: ForecastDataPoint[]
  metrics: ForecastMetrics
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/v1/forecast')
@Tags('AI Forecast')
export class ForecastSwaggerController extends Controller {
  /**
   * Generate a GRU-based time-series stock price forecast for a symbol.
   * Delegates to the Python AI Service, which trains/loads a GRU model on Tiingo OHLCV data.
   * Results are cached in Redis to avoid redundant inference.
   */
  @Get('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Stock forecast data retrieved successfully.')
  async getStockForecast(
    @Query() symbol: string,
    @Query() period: '1d' | '1w',
  ): Promise<ApiResponse<ForecastResult>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Export a forecast report as a PDF, regenerated from `symbol`/`period` query params.
   */
  @Get('pdf')
  @Security('bearerAuth')
  @SuccessResponse(200, 'PDF file stream')
  async exportForecastPdfGet(
    @Query() symbol?: string,
    @Query() period?: '1d' | '1w',
  ): Promise<void> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Export a forecast report as a PDF from a pre-computed forecast payload in the request body
   * (falls back to `symbol`/`period` query params if the body has no `symbol`).
   */
  @Post('pdf')
  @Security('bearerAuth')
  @SuccessResponse(200, 'PDF file stream')
  async exportForecastPdfPost(): Promise<void> {
    throw new Error('tsoa spec-only')
  }
}
