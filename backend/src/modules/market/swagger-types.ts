import { Controller, Get, Route, Tags, Security, SuccessResponse } from 'tsoa'
import { ApiResponse } from '../../shared/docs-types'

// ─── Models ───────────────────────────────────────────────────────────────────

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

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/v1/market')
@Tags('Market Data')
export class MarketSwaggerController extends Controller {
  /**
   * Get ranked, most-actively-traded US stocks ordered by a composite score
   * (volume, momentum, market cap). Results are cached for performance.
   */
  @Get('top-stocks')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Most actively traded stocks retrieved successfully.')
  async getTopStocks(): Promise<ApiResponse<RankedStock[]>> {
    throw new Error('tsoa spec-only')
  }
}
