// src/utils/jwt-utils.ts
import jwt, { SignOptions } from 'jsonwebtoken'
import { JwtPayload } from '../types'

import type { TokenExpiry } from '../types'

export const verifyAccessToken = (
  accessToken: string,
  accessTokenSecret: string,
): JwtPayload => {
  return jwt.verify(accessToken, accessTokenSecret) as JwtPayload
}

export const verifyRefreshToken = (
  refreshToken: string,
  refreshTokenSecret: string,
): { sub: string; jti: string } => {
  try {
    return jwt.verify(refreshToken, refreshTokenSecret) as {
      sub: string
      jti: string
    }
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new Error('FORCE_LOGOUT')
    }
    throw new Error('Invalid refresh token')
  }
}

export function signToken(
  payload: object,
  secret: string,
  expiresIn: TokenExpiry,
): string {
  const options: SignOptions = { expiresIn }
  return jwt.sign(payload, secret, options)
}
