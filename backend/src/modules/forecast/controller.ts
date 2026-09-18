import { NextFunction, Response } from 'express'
import { AuthenticatedRequest } from '../auth'
import { getForecast } from './service'
import { forecastQueryValidator } from './validation'
import { validateOrThrow } from '../../shared/errors'
import { getUserId, sendSuccess } from '../../shared/utils'
import { captureEvent, PostHogEvent } from '../../shared/infrastructure/posthog'
import {
  generateForecastPdfBuffer,
  getForecastReportFileName,
} from './pdf-generator'

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

    captureEvent(getUserId(req), PostHogEvent.ForecastGenerated, { symbol })

    return sendSuccess(res, {
      message: 'Stock forecast data retrieved successfully.',
      data: forecastData,
    })
  } catch (error) {
    next(error)
  }
}

export const exportForecastPdf = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    let forecastData = req.body
    if (!forecastData?.symbol) {
      const { symbol, period } = validateOrThrow(
        forecastQueryValidator,
        req.query,
      )
      forecastData = await getForecast(symbol, period)
    }

    const pdfBuffer = await generateForecastPdfBuffer(forecastData)
    const fileName = getForecastReportFileName(forecastData)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    return res.end(pdfBuffer)
  } catch (error) {
    next(error)
  }
}
