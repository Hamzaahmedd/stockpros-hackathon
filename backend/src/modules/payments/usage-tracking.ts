import { PlanTier } from '@prisma/client'
import { NextFunction, RequestHandler, Response } from 'express'
import type { AuthenticatedRequest } from '../../shared/request-types'
import { SEARCH_USAGE_FEATURE } from './constants'
import { recordUsage } from './credits'
import { logger } from '../../shared/infrastructure/logger'
import { getActiveMembership } from '../../shared/infrastructure/team-access'

/**
 * Records symbol-lookup searches by team members for the workspace analytics
 * dashboard. Fire-and-forget: analytics must never slow down or fail a search.
 */
export const trackSearchUsage: RequestHandler = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
) => {
  if (req.user?.plan === PlanTier.TEAM) {
    const userId = req.user.userId
    const query = typeof req.query.q === 'string' ? req.query.q : undefined
    void getActiveMembership(userId)
      .then((membership) =>
        membership
          ? recordUsage({ userId, membership }, SEARCH_USAGE_FEATURE, query)
          : undefined,
      )
      .catch((error: unknown) =>
        logger.warn(
          `[Usage] Failed to record search usage: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      )
  }
  next()
}
