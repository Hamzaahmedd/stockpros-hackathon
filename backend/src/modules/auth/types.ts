import type { PlanTier, PlatformRole, UserStatus } from '@prisma/client'
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
  phoneVerifiedAt?: Date | null
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
  phoneVerifiedAt: Date | null
  userRoles: Array<{ role: { name: string } }>
  plan: PlanTier
  platformRole: PlatformRole
}

export type { AuthenticatedRequest } from '../../shared/request-types'
