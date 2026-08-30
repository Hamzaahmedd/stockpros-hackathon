import {
  Controller,
  Get,
  Route,
  Tags,
  Security,
  SuccessResponse,
} from '@tsoa/runtime'
import { getRankedTopStocks } from './service'
import { RankedStockRow } from './types'

export interface GetTopStocksResponse {
  success: boolean
  message: string
  data: RankedStockRow[]
}

@Tags('Market Data')
@Route('api/v1/market')
export class MarketController extends Controller {
  /**
   * Retrieve ranked top US stocks with live market quotes.
   */
  @Get('top-stocks')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async getTopStocks(): Promise<GetTopStocksResponse> {
    const stocks = await getRankedTopStocks()
    return {
      success: true,
      message: 'Top US stocks retrieved successfully.',
      data: stocks,
    }
  }
}
