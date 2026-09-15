import { NextFunction, Response } from 'express'
import { AuthenticatedRequest } from '../auth'
import { validateOrThrow } from '../../shared/errors'
import { getUserId, sendSuccess } from '../../shared/utils'
import { getFeedbackQueryValidator, submitFeedbackValidator } from './validation'
import { listFeedback, submitFeedback } from './service'

export const createFeedback = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const { message, page } = validateOrThrow(
      submitFeedbackValidator,
      req.body,
    )

    const entry = await submitFeedback(userId, message, page)

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Thanks for your feedback!',
      data: entry,
    })
  } catch (error) {
    next(error)
  }
}

export const getAllFeedback = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = validateOrThrow(getFeedbackQueryValidator, req.query)
    const result = await listFeedback(query)

    return sendSuccess(res, {
      message: 'Feedback retrieved successfully.',
      data: result.data,
      extra: {
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        total: result.total,
      },
    })
  } catch (error) {
    next(error)
  }
}
