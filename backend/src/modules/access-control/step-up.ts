import config from '@/config'
import { NextFunction, Response } from 'express'
import { StepUpRequiredError, UnauthorizedError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import type { AuthenticatedRequest } from '../auth'

const MS_PER_MINUTE = 60_000

/**
 * Sensitive admin actions need the staff member to have re-verified (emailed
 * code) within the configured window. The window slides: every action that
 * completes successfully refreshes it, so someone actively working is not
 * interrupted while an abandoned, possibly stolen session lapses.
 */
export const requireStepUp = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!config.admin.stepUpEnabled) return next()

    const sessionId = req.user?.sessionId
    // Tokens minted before sessions were bound cannot carry a verification.
    if (!sessionId) throw new UnauthorizedError('Please sign in again')

    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { stepUpVerifiedAt: true },
    })
    const windowMs = config.admin.stepUpWindowMinutes * MS_PER_MINUTE
    const verifiedAt = session?.stepUpVerifiedAt
    if (!verifiedAt || Date.now() - verifiedAt.getTime() > windowMs) {
      throw new StepUpRequiredError()
    }

    res.once('finish', () => {
      if (res.statusCode >= 400) return
      prisma.userSession
        .updateMany({
          where: { id: sessionId },
          data: { stepUpVerifiedAt: new Date() },
        })
        .catch((err: unknown) =>
          logger.warn(
            `[Admin] Could not extend step-up window: ${String(err)}`,
          ),
        )
    })
    next()
  } catch (error) {
    next(error)
  }
}
