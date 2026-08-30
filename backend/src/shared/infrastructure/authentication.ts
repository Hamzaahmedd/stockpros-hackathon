import { Request } from 'express'
import config from '@/config'
import { UnauthorizedError, ForbiddenError } from '../errors'
import { prisma } from './database'
import { verifyAccessToken } from '../../modules/auth/utils/jwt'
import { checkPermission } from '../../modules/access-control/service'
import { Action, Resource } from '../../modules/access-control/permissions'

const ACCESS_TOKEN_SECRET = config.auth.accessTokenSecret

export async function expressAuthentication(
  request: Request,
  securityName: string,
  scopes?: string[],
): Promise<any> {
  if (securityName === 'jwt' || securityName === 'bearerAuth') {
    const authHeader = request.headers.authorization
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null

    if (!accessToken) {
      throw new UnauthorizedError('Access token missing')
    }

    try {
      const payload = verifyAccessToken(accessToken, ACCESS_TOKEN_SECRET)

      if (payload.jti) {
        const session = await prisma.userSession.findUnique({
          where: { jti: payload.jti },
        })

        if (!session || session.isRevoked || new Date() > session.expiresAt) {
          throw new UnauthorizedError('Session expired or revoked')
        }
      }

      const user = { userId: payload.sub, jti: payload.jti }
      ;(request as any).user = user

      // Check scopes / permissions if provided (e.g. scopes: ["ROLE:READ", "PORTFOLIO:CREATE"])
      if (scopes && scopes.length > 0) {
        for (const scope of scopes) {
          const [resource, action] = scope.split(':')
          if (resource && action) {
            const allowed = await checkPermission(
              user.userId,
              resource.toLowerCase() as Resource,
              action.toLowerCase() as Action,
            )
            if (!allowed) {
              throw new ForbiddenError(`Insufficient permissions for ${scope}`)
            }
          }
        }
      }

      return user
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Authentication required (Token Expired)')
      }
      throw error
    }
  }

  return Promise.resolve(null)
}
