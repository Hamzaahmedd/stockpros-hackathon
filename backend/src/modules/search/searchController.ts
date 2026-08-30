import {
  Controller,
  Get,
  Query,
  Route,
  Tags,
  Security,
  SuccessResponse,
} from '@tsoa/runtime'
import { searchSymbols } from './service'
import { SymbolSearchResult } from './types'

export interface SymbolLookupResponse {
  success: boolean
  message: string
  data: SymbolSearchResult[]
}

@Tags('Search')
@Route('api/v1/search')
export class SearchController extends Controller {
  /**
   * Look up stock symbols matching a search query.
   */
  @Get('symbol-lookup')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async symbolLookup(
    @Query() q: string,
    @Query() exchange?: string,
  ): Promise<SymbolLookupResponse> {
    const results = await searchSymbols(q, exchange || 'US')
    return {
      success: true,
      message: 'Symbol lookup completed successfully.',
      data: results,
    }
  }
}
