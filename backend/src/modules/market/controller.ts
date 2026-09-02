import { NextFunction, Response } from 'express'
import { AuthenticatedRequest } from '../auth'
import { getRankedTopStocks } from './service'
import { sendSuccess } from '../../shared/utils'

export const getTopStocks = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const stocks = await getRankedTopStocks()

    return sendSuccess(res, {
      message: 'Most actively traded stocks retrieved successfully.',
      data: stocks,
    })
  } catch (error) {
    next(error)
  }
}
