import { NextFunction, Response } from 'express'
import { AuthenticatedRequest } from '../auth'
import { getForecast } from './service'
import { forecastQueryValidator } from './validation'
import { validateOrThrow } from '../../shared/errors'
import { sendSuccess } from '../../shared/utils'

export const getStockForecast = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { symbol, period } = validateOrThrow(
      forecastQueryValidator,
      req.query,
    )
    const forecastData = await getForecast(symbol, period)

    return sendSuccess(res, {
      message: 'Stock forecast data retrieved successfully.',
      data: forecastData,
    })
  } catch (error) {
    next(error)
  }
}
