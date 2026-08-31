import {
  Controller,
  Get,
  Route,
  Tags,
  Security,
  Query,
  SuccessResponse,
} from 'tsoa'
import { ApiResponse } from '../../shared/docs-types'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface SymbolSearchResult {
  symbol: string
  description: string
  type: string
  exchange: string
  currency?: string
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/search')
@Tags('Search')
export class SearchSwaggerController extends Controller {
  /**
   * Search for stock symbols or company names (autocomplete).
   * Powered by Finnhub symbol search with US exchange filter by default.
   * @param q Search query (e.g. "Apple" or "AAPL")
   * @param exchange Exchange filter (default: "US")
   */
  @Get('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Search results returned')
  async searchSymbols(
    @Query() q: string,
    @Query() exchange?: string,
  ): Promise<ApiResponse<SymbolSearchResult[]>> {
    throw new Error('tsoa spec-only')
  }
}
