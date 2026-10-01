import config from '@/config'
import type { PlanTier } from '@prisma/client'
import { NextFunction, Response } from 'express'
import { UnauthorizedError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { AuthenticatedRequest } from './types'
import { verifyAccessToken } from './utils/jwt'

const ACCESS_TOKEN_SECRET = config.auth.accessTokenSecret

interface ResolvedSession {
  sessionId?: string
  sessionCreatedAt?: Date
  plan: PlanTier
}

/**
 * Validates the session an access token is bound to (`sid`) on every request,
 * so revoking a session (logout, breach response, staff action) blocks it
 * immediately. Only the columns the check needs are read.
 */
const resolveSession = async (
  userId: string,
  sessionId: string,
): Promise<ResolvedSession> => {
  const session = await prisma.userSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      isRevoked: true,
      expiresAt: true,
      createdAt: true,
      user: { select: { plan: true } },
    },
  })

  if (
    !session ||
    session.userId !== userId ||
    session.isRevoked ||
    new Date() > session.expiresAt
  ) {
    throw new UnauthorizedError('Session expired or revoked')
  }

  return {
    sessionId: session.id,
    sessionCreatedAt: session.createdAt,
    plan: session.user.plan,
  }
}

/**
 * Transitional path for access tokens minted before `sid` existed. They cannot
 * be tied to a session, but the user's plan is still read from the database
 * rather than assumed. Nothing issues such tokens any more, so they all expire
 * within one access-token lifetime of deploying session binding, after which
 * this function and its branch can be deleted.
 */
const resolveLegacyUser = async (userId: string): Promise<ResolvedSession> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  })
  if (!user) throw new UnauthorizedError('Session expired or revoked')
  return { plan: user.plan }
}

export const authTokenMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Get token from Authorization header (Bearer <token>)
    const authHeader = req.headers.authorization
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null

    if (!accessToken) {
      throw new UnauthorizedError('Access token missing')
    }

    // Verify JWT and get payload
    const payload = verifyAccessToken(accessToken, ACCESS_TOKEN_SECRET)

    const resolved = payload.sid
      ? await resolveSession(payload.sub, payload.sid)
      : await resolveLegacyUser(payload.sub)

    // Attach user info to request
    req.user = { userId: payload.sub, ...resolved }
    next()
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Authentication required (Token Expired)')
    }
    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
      throw new UnauthorizedError('Invalid access token')
    }
    next(error)
  }
}
