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
import {
  ApiResponse,
  ApiErrorResponse,
  PaginatedResponse,
} from '../../shared/docs-types'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface DecisionResult {
  symbol: string
  /** @enum {string} */
  marketDecision: 'BUY' | 'SELL' | 'HOLD'
  /** @enum {string} */
  portfolioDecision: 'BUY' | 'SELL' | 'HOLD' | 'REDUCE' | 'INCREASE'
  confidence: number
  /** @enum {string} */
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  sector?: string
  reasoning: Record<string, unknown>
  exposure: Record<string, unknown>
  actionGuidance: Record<string, unknown>
}

export interface DecisionFactor {
  name: string
  value: string | number
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  weight: number
}

export interface RunDecisionRequest {
  portfolioId: string
  /** @enum {string} */
  mode?: 'DETAILED' | 'SUMMARY'
}

export interface PortfolioPosition {
  symbol: string
  quantity: number
  avgEntryPrice: number
  sector?: string
}

export interface DecisionRunRecord {
  id: string
  portfolioId: string
  mode: string
  runAt: string
  results: DecisionResult[]
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/decision-support')
@Tags('Decision Support')
export class DecisionSupportSwaggerController extends Controller {
  /**
   * Run the full multi-factor decision engine for a user's portfolio.
   * Combines technical indicators (RSI, Bollinger Bands), analyst ratings, news sentiment,
   * earnings data, and portfolio exposure to produce BUY/SELL/HOLD recommendations.
   */
  @Post('run')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Decision analysis complete')
  @Response<ApiErrorResponse>(400, 'Invalid portfolio ID')
  async runDecision(
    @Body() body: RunDecisionRequest,
  ): Promise<ApiResponse<DecisionRunRecord>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Upload a portfolio CSV or XLSX file for batch position import.
   * Accepted columns: symbol, quantity, avgEntryPrice, sector.
   */
  @Post('portfolio/upload')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Portfolio uploaded and parsed')
  @Response<ApiErrorResponse>(400, 'Unsupported file format')
  async uploadPortfolio(): Promise<
    ApiResponse<{ positions: PortfolioPosition[] }>
  > {
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
   * Fetch a single decision run by ID including all per-symbol results.
   */
  @Get('history/{id}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Decision run returned')
  @Response<ApiErrorResponse>(404, 'Record not found')
  async getHistoryById(
    @Path() id: string,
  ): Promise<ApiResponse<DecisionRunRecord>> {
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
