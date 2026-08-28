import type { UserStatus } from '@prisma/client'
import type * as express from 'express'
import type { SignOptions } from 'jsonwebtoken'

export type TokenExpiry = SignOptions['expiresIn']

export interface UserData {
  userId: string
  email: string
  displayName: string
  roleId?: string
  status: UserStatus
  createdAt?: Date
  updatedAt?: Date
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  jti: string
}

export interface JwtPayload {
  sub: string
  iat: number
  exp: number
  jti?: string
}

/** Minimal claims read from onboarding / access tokens after verification. */
export interface TokenClaims {
  sub?: string
  type?: string
}

/** Profile shape returned by the authenticated "me" endpoint. */
export interface MeProfile {
  userId: string
  email: string
  displayName: string | null
  userRoles: Array<{ role: { name: string } }>
}

export interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string
    jti?: string
    roleId?: string
  }
  file?: Express.Multer.File
}
