import { UnauthorizedError } from '../errors'
import type { AuthenticatedRequest } from '../../modules/auth/types'

export const getUserId = (req: AuthenticatedRequest): string => {
  const userId = req.user?.userId
  if (!userId) throw new UnauthorizedError('User not authenticated')
  return userId
}
