import config from '@/config'
import { PlatformRole } from '@prisma/client'
import { NextFunction, Response } from 'express'
import {
  FeatureDisabledError,
  ForbiddenError,
  UnauthorizedError,
} from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { authTokenMiddleware, AuthenticatedRequest } from '../auth'

/** Ascending privilege order; a role satisfies any requirement at or below its rank. */
export const PLATFORM_ROLE_RANK: Readonly<Record<PlatformRole, number>> = {
  [PlatformRole.USER]: 0,
  [PlatformRole.SUPPORT_AGENT]: 1,
  [PlatformRole.PLATFORM_ADMIN]: 2,
  [PlatformRole.SUPER_ADMIN]: 3,
}

export const hasPlatformRole = (
  actual: PlatformRole | null | undefined,
  required: PlatformRole,
): boolean =>
  PLATFORM_ROLE_RANK[actual ?? PlatformRole.USER] >=
  PLATFORM_ROLE_RANK[required]

/**
 * Tier-workflow gate for the internal ops panel. Runs before authentication so
 * an unauthenticated probe learns nothing beyond "feature disabled".
 */
export const requirePricingTiersEnabled = (
  _req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
) => {
  if (!config.features.pricingTiersEnabled) {
    return next(
      new FeatureDisabledError(
        'The internal admin panel is only available in the tier-based workflow',
      ),
    )
  }
  next()
}

const assertPlatformRole = async (
  req: AuthenticatedRequest,
  required: PlatformRole,
) => {
  const userId = req.user?.userId
  if (!userId) throw new UnauthorizedError('Authentication required')

  // Read from the DB on every request (not a JWT claim) so a demotion applies immediately.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  })
  if (!hasPlatformRole(user?.platformRole, required)) {
    throw new ForbiddenError('Insufficient platform role')
  }
}

/**
 * Staff-only access: tier gate → authentication → minimum platform role.
 * Returns the middleware chain to spread/mount on a route or router.
 */
export const requirePlatformRole = (required: PlatformRole) => [
  requirePricingTiersEnabled,
  authTokenMiddleware,
  async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      await assertPlatformRole(req, required)
      next()
    } catch (error) {
      next(error)
    }
  },
]
