import {
  Controller,
  Get,
  Post,
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

export interface DecisionResult {
  symbol: string
  sector: string
  /** @enum {string} */
  marketDecision: 'BUY' | 'SELL' | 'HOLD / CAUTION'
  /** @enum {string} */
  portfolioDecision: 'ADD' | 'HOLD' | 'TRIM' | 'EXIT'
  confidence: number
  /** @enum {string} */
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  reasoning: Record<string, unknown>
  exposure: Record<string, unknown>
  actionGuidance: Record<string, unknown>
}

export interface PortfolioPosition {
  symbol: string
  quantity: number
  avg_entry_price: number
  sector?: string
}

export interface PositionSizeRequest {
  capital: number
  symbol: string
}

export interface PortfolioDecisionRequest {
  portfolioId: string
  /** @enum {string} */
  decisionMode: 'OVERVIEW' | 'DETAILED'
  symbol?: string
}

export interface PortfolioRiskMetricsRequest {
  portfolioId: string
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/v1/decision-support')
@Tags('Decision Support')
export class DecisionSupportSwaggerController extends Controller {
  /**
   * Get the market-level trade decision (technicals + analyst ratings + sentiment) for a symbol.
   */
  @Get('market/decision/{symbol}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Trade decision retrieved successfully.')
  async getMarketBasedTradeDecision(
    @Path() symbol: string,
  ): Promise<ApiResponse<unknown>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Get the opportunity radar — ranked candidate trades across the watchlist universe.
   */
  @Get('market/radar')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Opportunity radar retrieved successfully.')
  async getOpportunityRadar(
    @Query() timeline?: '1D' | '1W',
  ): Promise<ApiResponse<unknown>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Calculate suggested position size for a symbol given available capital.
   */
  @Post('market/position-size')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Position size calculated successfully.')
  async calculatePositionSize(
    @Body() body: PositionSizeRequest,
  ): Promise<ApiResponse<unknown>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Upload a portfolio CSV/XLSX file for batch position import (multipart/form-data, field "portfolio").
   */
  @Post('upload-portfolio')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Portfolio uploaded successfully.')
  @Response<ApiErrorResponse>(400, 'Unsupported file format')
  async uploadPortfolio(): Promise<
    ApiResponse<{ positions: PortfolioPosition[] }>
  > {
    throw new Error('tsoa spec-only')
  }

  /**
   * Generate per-position decisions (ADD/HOLD/TRIM/EXIT) for the user's latest uploaded portfolio.
   */
  @Post('portfolio/decision')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Decisions generated successfully.')
  async getPortfolioBasedTradeDecision(
    @Body() body: PortfolioDecisionRequest,
  ): Promise<ApiResponse<DecisionResult[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Get portfolio-level risk metrics (weighted beta, Sharpe ratio, sector concentration).
   */
  @Post('portfolio/risk-metrics')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Portfolio risk metrics calculated successfully.')
  async getPortfolioRiskMetrics(
    @Body() body: PortfolioRiskMetricsRequest,
  ): Promise<ApiResponse<unknown>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Fetch the authenticated user's most recently uploaded portfolio.
   */
  @Get('portfolio/latest')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Latest portfolio retrieved successfully.')
  async getLatestPortfolio(): Promise<ApiResponse<unknown>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Remove all uploaded portfolio data for the authenticated user.
   */
  @Delete('portfolio')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Portfolio removed successfully.')
  async removePortfolio(): Promise<ApiResponse<{ removedCount: number }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Export a single-symbol trade plan as a PDF (binary response, not JSON).
   */
  @Post('trade-plan/pdf')
  @Security('bearerAuth')
  @SuccessResponse(200, 'PDF file stream')
  async exportTradePlanPdf(): Promise<void> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Export the full portfolio decision report as a PDF (binary response, not JSON).
   */
  @Post('portfolio/pdf')
  @Security('bearerAuth')
  @SuccessResponse(200, 'PDF file stream')
  async exportPortfolioPdf(): Promise<void> {
    throw new Error('tsoa spec-only')
  }
}
