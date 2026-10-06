import { PlanTier } from '@prisma/client'
import { NextFunction, Response } from 'express'
import { AuthenticatedRequest } from '../auth'
import { validateOrThrow } from '../../shared/errors'
import { getUserId, sendSuccess } from '../../shared/utils'
import {
  feedbackIdParamValidator,
  getFeedbackQueryValidator,
  submitFeedbackValidator,
  updateFeedbackStatusValidator,
} from './validation'
import { listFeedback, submitFeedback, updateFeedbackStatus } from './service'

export const createFeedback = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const { message, page, category, metadata } = validateOrThrow(
      submitFeedbackValidator,
      req.body,
    )
    // The plan comes from the session, not the request: the client cannot claim a tier.
    const planTier = req.user?.plan ?? PlanTier.FREE

    const entry = await submitFeedback({
      userId,
      planTier,
      message,
      page,
      category,
      clientMetadata: metadata,
    })

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
        counts: result.counts,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const setFeedbackStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actorId = getUserId(req)
    const { id } = validateOrThrow(feedbackIdParamValidator, req.params)
    const { status } = validateOrThrow(updateFeedbackStatusValidator, req.body)

    const result = await updateFeedbackStatus(actorId, id, status)

    return sendSuccess(res, {
      message: 'Feedback status updated.',
      data: result,
    })
  } catch (error) {
    next(error)
  }
}
