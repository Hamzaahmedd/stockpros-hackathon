import { NextFunction, Response } from 'express'
import { AuthenticatedRequest } from '../auth'
import { validateOrThrow } from '../../shared/errors'
import {
  calculatePositionSize,
  getLatestPortfolioForUser,
  getMarketDecisionResponse,
  getOpportunityRadar,
  getPortfolioDecisionResponse,
  getPortfolioRiskMetrics,
  uploadPortfolio,
} from './service'
import {
  opportunityRadarQueryValidator,
  portfolioDecisionRequestValidator,
  portfolioRiskMetricsValidator,
  positionSizeValidator,
} from './validation'
import { getUserId, sendSuccess } from '../../shared/utils'

export const getMarketBasedTradeDecision = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const symbol = req.params.symbol as string
    const data = await getMarketDecisionResponse(symbol)

    sendSuccess(res, {
      message: 'Trade decision retrieved successfully.',
      data,
    })
  } catch (error) {
    next(error)
  }
}

export const getOpportunityRadarHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { timeline } = validateOrThrow(
      opportunityRadarQueryValidator,
      req.query,
    )
    const data = await getOpportunityRadar(timeline || '1D')

    sendSuccess(res, {
      message: 'Opportunity radar retrieved successfully.',
      data,
    })
  } catch (error) {
    next(error)
  }
}

export const calculatePositionSizeHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { capital, symbol } = validateOrThrow(
      positionSizeValidator,
      req.body,
    )

    const marketData = await getMarketDecisionResponse(symbol)
    const currentPrice = marketData.priceState.current
    const stopLoss = marketData.priceTargets.stopLoss
    const bullTarget = marketData.priceTargets.bullTarget

    const sizing = calculatePositionSize({
      capital,
      currentPrice,
      stopLoss,
      bullTarget,
    })

    sendSuccess(res, {
      message: 'Position size calculated successfully.',
      data: {
        symbol,
        capital,
        currentPrice,
        stopLoss,
        bullTarget,
        atr: marketData.atr,
        recommendation: marketData.decision.recommendation,
        confidence: marketData.decision.confidence,
        ...sizing,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const getPortfolioRiskMetricsHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { portfolioId } = validateOrThrow(
      portfolioRiskMetricsValidator,
      req.body,
    )
    const data = await getPortfolioRiskMetrics(portfolioId)

    sendSuccess(res, {
      message: 'Portfolio risk metrics calculated successfully.',
      data,
    })
  } catch (error) {
    next(error)
  }
}

export const getLatestPortfolio = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const portfolio = await getLatestPortfolioForUser(userId)

    sendSuccess(res, {
      message: 'Latest portfolio retrieved successfully.',
      data: portfolio,
    })
  } catch (error) {
    next(error)
  }
}

export const uploadTraderPortfolio = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const fileType = req.file?.mimetype
    const buffer = req.file?.buffer
    const userId = getUserId(req)

    const data = await uploadPortfolio(fileType, buffer, userId)

    sendSuccess(res, {
      message: 'Portfolio uploaded successfully.',
      data,
    })
  } catch (error) {
    next(error)
  }
}

export const getPortfolioBasedTradeDecision = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { portfolioId, decisionMode } = validateOrThrow(
      portfolioDecisionRequestValidator,
      req.body,
    )
    const userId = getUserId(req)
    const data = await getPortfolioDecisionResponse(
      userId,
      portfolioId,
      decisionMode,
    )

    sendSuccess(res, {
      message: `${decisionMode} decisions generated successfully.`,
      data,
    })
  } catch (error) {
    next(error)
  }
}

