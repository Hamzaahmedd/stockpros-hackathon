import { Response, NextFunction } from 'express'
import { AuthenticatedRequest } from '../auth'
import { Action, Resource } from './permissions'
import { ForbiddenError } from '../../shared/errors'
import { checkPermission } from './service'

export function rbacMiddleware(resource: Resource, action: Action) {
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
