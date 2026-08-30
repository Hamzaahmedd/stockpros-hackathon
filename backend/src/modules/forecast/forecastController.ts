import {
  Controller,
  Get,
  Query,
  Route,
  Tags,
  Security,
  SuccessResponse,
} from '@tsoa/runtime'
import { getForecast } from './service'
import { ForecastResponse } from './types'

@Tags('AI Forecast')
@Route('api/v1/forecast')
export class ForecastController extends Controller {
  /**
   * Retrieve AI Forecast predictions (1d, 1w) combined with technical baselines for a stock symbol.
   */
  @Get('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async getStockForecast(
    @Query() symbol: string,
    @Query() period: '1d' | '1w',
  ): Promise<ForecastResponse> {
    const uppercaseSymbol = symbol.toUpperCase()
    return await getForecast(uppercaseSymbol, period)
  }
}
