import { NextFunction, Response } from 'express'
import { AuthenticatedRequest } from '../auth'
import { validateOrThrow } from '../../shared/errors'
import {
  getLatestPortfolioForUser,
  getMarketDecisionResponse,
  getPortfolioDecisionResponse,
  uploadPortfolio,
} from './service'
import { portfolioDecisionRequestValidator } from './validation'
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
