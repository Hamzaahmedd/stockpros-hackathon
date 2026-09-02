import { Response, NextFunction } from 'express'
import { AuthenticatedRequest } from '../auth'
import { ForbiddenError } from '../../shared/errors'
import { checkPermission } from './service'

export interface PermissionRequirement {
  resource: string
  action: string
}

export function rbacMiddleware(resource: string, action: string) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const userId = req.user?.userId
    const allowed = await checkPermission(userId, resource, action)
    if (!allowed) return next(new ForbiddenError('Insufficient permissions'))

    next()
  }
}

export function allRbacMiddleware(
  ...requirements: readonly PermissionRequirement[]
) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const userId = req.user?.userId
    const allowed = await Promise.all(
      requirements.map(({ resource, action }) =>
        checkPermission(userId, resource, action),
      ),
    )

    if (allowed.every(Boolean)) return next()
    return next(new ForbiddenError('Insufficient permissions'))
  }
}
