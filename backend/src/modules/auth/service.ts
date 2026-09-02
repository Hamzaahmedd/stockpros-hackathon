// Consolidated auth service
import config from '@/config'
import { RoleName, UserStatus } from '@prisma/client'
import { OAuth2Client } from 'google-auth-library'
import jwt, { SignOptions } from 'jsonwebtoken'
import crypto from 'node:crypto'
import { uuidv7 } from 'uuidv7'
import {
    NotFoundError,
    UnauthorizedError,
    ValidationError,
} from '../../shared/errors'
import { transporter } from '../../shared/infrastructure/config/email'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import {
    convertToMilliseconds,
    signToken,
    verifyRefreshToken,
} from '../../shared/utils'
import { buildMagicLinkEmail } from '../notifications/email-templates/index'
import { enqueueAuthEmail } from '../notifications/public'
import { AuthTokens, MeProfile, TokenClaims, UserData } from './types'

const ACCESS_TOKEN_EXPIRY = config.auth.accessTokenExpiry
const REFRESH_TOKEN_EXPIRY = config.auth.refreshTokenExpiry
const ACCESS_TOKEN_SECRET = config.auth.accessTokenSecret
const REFRESH_TOKEN_SECRET = config.auth.refreshTokenSecret
const GOOGLE_CLIENT_ID = config.auth.googleClientId

const googleOAuthClient = new OAuth2Client(GOOGLE_CLIENT_ID)

export async function generateTokens(userId: string): Promise<AuthTokens> {
  const refreshJti = uuidv7()

  const accessToken = signToken(
    { sub: userId },
    ACCESS_TOKEN_SECRET,
    ACCESS_TOKEN_EXPIRY as SignOptions['expiresIn'],
  )

  const refreshToken = signToken(
    { sub: userId, jti: refreshJti },
    REFRESH_TOKEN_SECRET,
    REFRESH_TOKEN_EXPIRY as SignOptions['expiresIn'],
  )

  return { accessToken, refreshToken, jti: refreshJti }
}

export async function refreshAccessToken(refreshToken: string) {
  try {
    // Step 1: Basic JWT verification
    const payload = verifyRefreshToken(refreshToken, REFRESH_TOKEN_SECRET)

    // Step 2: Check session in DB
    const session = await prisma.userSession.findUnique({
      where: { jti: payload.jti },
      include: { user: true },
    })

    // Step 3: Enforce force logout
    if (!session || session.isRevoked || new Date() > session.expiresAt) {
      throw new UnauthorizedError('Refresh token expired or invalid')
    }

    // Step 4: Issue new access token
    const { accessToken } = await generateTokens(session.user.id)

    return accessToken
  } catch (err: unknown) {
    if (!(err instanceof UnauthorizedError)) {
      logger.warn(`[Auth] refreshAccessToken failed: ${String(err)}`)
    }
    throw new UnauthorizedError('Invalid refresh token')
  }
}

export async function logoutUser(refreshToken?: string) {
  if (!refreshToken) return null

  try {
    const decoded = jwt.decode(refreshToken) as { jti?: string } | null

    if (!decoded?.jti) {
      return null
    }

    // Find the user session before deleting it
    const session = await prisma.userSession.findUnique({
      where: { jti: decoded.jti },
      select: { userId: true },
    })

    // Delete the session
    await prisma.userSession.deleteMany({
      where: { jti: decoded.jti },
    })

    if (!session) {
      return null
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true },
    })

    return user
  } catch {
    logger.warn('Failed to decode refresh token during logout')
    return null
  }
}

// ─── Account Deletion ─────────────────────────────────────────────────────────

export async function deleteAccount(userId: string): Promise<void> {
  // Step 1: Verify the user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, status: true },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (user.status === UserStatus.DELETED) {
    throw new UnauthorizedError('Account is already deleted')
  }

  // Step 2: Immediately revoke ALL active sessions — blocks all future requests
  await prisma.userSession.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true },
  })

  // Step 3: Purge all user-owned data in a single transaction
  await prisma.$transaction(async (tx) => {
    // Watchlist alerts first (FK child of Watchlist)
    await tx.watchlistAlert.deleteMany({ where: { userId } })
    // Watchlists (cascades AlertLog via WatchlistAlert -> AlertLog)
    await tx.watchlist.deleteMany({ where: { userId } })
    // Notifications
    await tx.notification.deleteMany({ where: { userId } })
    // News read states & saved articles
    await tx.newsReadState.deleteMany({ where: { userId } })
    await tx.newsSavedArticle.deleteMany({ where: { userId } })
    // Decision runs (cascades DecisionResult)
    await tx.decisionRun.deleteMany({ where: { userId } })
    // Portfolios (cascades Position)
    await tx.portfolio.deleteMany({ where: { userId } })
    // Roles & permissions
    await tx.userRole.deleteMany({ where: { userId } })
    await tx.userPermission.deleteMany({ where: { userId } })
    // Magic link tokens (keyed by email, not userId)
    await tx.magicLinkToken.deleteMany({ where: { email: user.email } })

    // Step 4: Soft-delete the user — keeps the row for audit/fraud purposes
    const now = new Date()
    const purgeAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days

    await tx.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.DELETED,
        deletedAt: now,
        deletionScheduledAt: purgeAt,
        // Anonymise PII immediately
        displayName: '[deleted]',
        email: `deleted+${userId}@stockpros.invalid`,
      },
    })
  })

  logger.info(`[Auth] Account deleted for userId=${userId}`)
}



export async function fetchMe(userId: string): Promise<MeProfile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      userRoles: {
        include: {
          role: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  })

  if (!user) throw new NotFoundError('User not found')

  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    userRoles: user.userRoles,
  }
}

// ─── Passwordless Magic Link Methods ───────────────────────────────────────────

export function resolveFrontendUrl(clientOrigin?: string): string {
  if (config.server.nodeEnv === 'production') {
    if (config.server.frontendUrl) return config.server.frontendUrl
    throw new Error(
      'FRONTEND_URL must be configured in production to generate magic links',
    )
  }

  // Development mode: prefer clientOrigin, fallback to config, fallback to localhost
  return clientOrigin || config.server.frontendUrl || 'http://localhost:5173'
}

export async function generateMagicLink(
  rawEmail: string,
  clientOrigin?: string,
): Promise<void> {
  const email = rawEmail.toLowerCase().trim()

  // 1. Generate a cryptographically secure random raw token (64 hex characters)
  const rawToken = crypto.randomBytes(32).toString('hex')

  // 2. Immediately calculate SHA-256 hash of the token
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

  // 3. Set expiration to strictly 10 minutes
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  // Clean up any existing tokens for this email to avoid clutter
  await prisma.magicLinkToken.deleteMany({
    where: { email },
  })

  // 4. Save ONLY the hash in the database
  await prisma.magicLinkToken.create({
    data: {
      email,
      tokenHash,
      isUsed: false,
      expiresAt,
    },
  })

  // 5. Build accessible login link (supports mobile devices and all browsers)
  const frontendUrl = resolveFrontendUrl(clientOrigin)
  const loginLink = `${frontendUrl}/auth/verify?token=${rawToken}`

  // Production: offload delivery to BullMQ so the login request returns
  // immediately and transient SMTP failures are retried by the worker rather
  // than erroring out to the user. Dev: send synchronously to preserve the
  // console-link fallback and immediate feedback.
  if (config.server.nodeEnv === 'production') {
    const enqueued = await enqueueAuthEmail({
      to: email,
      loginLink,
      expiryMinutes: config.auth.magicLinkExpiryMinutes,
    })
    // Queue unavailable (e.g. Redis down) — fall through to a direct send so
    // the user still receives their link instead of silently getting nothing.
    if (enqueued) return
  }

  const emailContent = buildMagicLinkEmail(
    loginLink,
    config.auth.magicLinkExpiryMinutes,
  )
  try {
    await transporter.sendMail({
      to: email,
      ...emailContent,
    })
  } catch (mailErr) {
    logger.error('[MagicLink] Failed to send email', mailErr)
    if (config.server.nodeEnv !== 'production') {
      logger.info(`Magic link for ${email}: ${loginLink}`)
    } else {
      throw mailErr
    }
  }
}

// ─── Helper: diagnose why a magic-link update matched 0 rows ─────────────────

async function diagnoseMagicLinkFailure(
  tokenHash: string,
  now: Date,
): Promise<never> {
  const existing = await prisma.magicLinkToken.findUnique({
    where: { tokenHash },
  })

  if (existing?.isUsed) {
    throw new UnauthorizedError('This login link has already been used')
  }

  if (existing && existing.expiresAt <= now) {
    await prisma.magicLinkToken.deleteMany({ where: { tokenHash } })
    throw new UnauthorizedError(
      'This login link has expired. Please request a new one',
    )
  }

  throw new UnauthorizedError('Invalid or expired login link')
}

export async function verifyMagicLink(
  rawToken: string,
  ip: string,
  userAgent: string,
): Promise<
  | {
      requiresOnboarding: true
      onboardingToken: string
      user: null
      accessToken: null
      refreshToken: null
    }
  | {
      requiresOnboarding: false
      user: UserData
      accessToken: string
      refreshToken: string
      onboardingToken?: undefined
    }
> {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new UnauthorizedError('Invalid login link token')
  }

  // 1. Calculate SHA-256 hash of incoming raw token
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const now = new Date()

  // 2. Atomic Verification & Link Death:
  // Atomically find unexpired, unused token and set isUsed = true
  const updateResult = await prisma.magicLinkToken.updateMany({
    where: {
      tokenHash,
      isUsed: false,
      expiresAt: {
        gt: now,
      },
    },
    data: {
      isUsed: true,
    },
  })

  // If update count is 0, the token is either invalid, already used, or expired
  if (updateResult.count === 0) {
    await diagnoseMagicLinkFailure(tokenHash, now)
  }

  // 3. Retrieve the token record to get the associated email
  const magicLink = await prisma.magicLinkToken.findUnique({
    where: { tokenHash },
  })

  if (!magicLink) {
    throw new UnauthorizedError('Login link record not found')
  }

  const email = magicLink.email.toLowerCase().trim()

  // 4. Database Account Match: Query user database table for existing user account
  let user = await prisma.user.findUnique({
    where: { email },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  })

  // If user doesn't exist yet — don't auto-create, require onboarding first
  if (!user) {
    // Issue a short-lived onboarding token so the frontend can complete signup
    const onboardingToken = signToken(
      { sub: email, type: 'onboarding' },
      ACCESS_TOKEN_SECRET,
      '15m',
    )

    // Hard delete the used magic-link token
    await prisma.magicLinkToken.deleteMany({ where: { tokenHash } })

    return {
      requiresOnboarding: true,
      onboardingToken,
      user: null,
      accessToken: null,
      refreshToken: null,
    }
  }

  if (user.userRoles.length === 0) {
    // Existing user has no roles — assign default ANALYST role
    const analystRole = await prisma.role.findFirst({
      where: { name: RoleName.ANALYST },
    })

    if (analystRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: analystRole.id,
          assignedById: user.id,
        },
      })

      user = (await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      }))!
    }
  }

  if (user?.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedError('Account is inactive or suspended')
  }

  // 5. Jump to current session management setup:
  // Generate access and refresh tokens
  const { accessToken, refreshToken, jti } = await generateTokens(user.id)

  const refreshTokenExpiryMs =
    convertToMilliseconds(REFRESH_TOKEN_EXPIRY as string) || 604800000

  // Create active session in database
  await prisma.userSession.create({
    data: {
      userId: user.id,
      jti,
      ipAddress: ip,
      userAgent,
      expiresAt: new Date(Date.now() + refreshTokenExpiryMs),
    },
  })

  // 6. Hard delete the used token record from DB to prevent DB bloating
  await prisma.magicLinkToken.deleteMany({
    where: { tokenHash },
  })

  return {
    requiresOnboarding: false,
    user: {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      roleId: user.userRoles?.[0]?.roleId,
      status: user.status,
    },
    accessToken,
    refreshToken,
  }
}

export async function completeOnboarding(
  email: string,
  displayName: string,
  ip: string,
  userAgent: string,
): Promise<{ user: UserData; accessToken: string; refreshToken: string }> {
  const normalizedEmail = email.toLowerCase().trim()

  // Create user + assign ANALYST role in a single transaction
  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        displayName: displayName.trim(),
        status: UserStatus.ACTIVE,
      },
    })

    const analystRole = await tx.role.findFirst({
      where: { name: RoleName.ANALYST },
    })

    if (!analystRole) {
      throw new Error('Analyst role not found')
    }

    await tx.userRole.create({
      data: {
        userId: createdUser.id,
        roleId: analystRole.id,
        assignedById: createdUser.id,
      },
    })

    return tx.user.findUniqueOrThrow({
      where: { id: createdUser.id },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    })
  })

  // Generate session tokens now that signup is complete
  const { accessToken, refreshToken, jti } = await generateTokens(user.id)
  const refreshTokenExpiryMs =
    convertToMilliseconds(REFRESH_TOKEN_EXPIRY as string) || 604800000

  await prisma.userSession.create({
    data: {
      userId: user.id,
      jti,
      ipAddress: ip,
      userAgent,
      expiresAt: new Date(Date.now() + refreshTokenExpiryMs),
    },
  })

  return {
    user: {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      roleId: user.userRoles?.[0]?.roleId,
      status: user.status,
    },
    accessToken,
    refreshToken,
  }
}

// ─── Onboarding flow orchestration ───────────────────────────────────────────

export type OnboardingFlowResult =
  | { kind: 'profileUpdated'; user: UserData }
  | {
      kind: 'signupCompleted'
      user: UserData
      accessToken: string
      refreshToken: string
    }

// ─── Helper: resolve email from a bearer access token ────────────────────────

async function resolveEmailFromBearer(
  authHeader: string | undefined,
  resolvedName: string,
): Promise<{ email: string } | { kind: 'profileUpdated'; user: UserData } | null> {
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null

  if (!bearerToken) return null

  try {
    const decoded = jwt.verify(bearerToken, ACCESS_TOKEN_SECRET) as TokenClaims
    if (!decoded?.sub) return null

    const updated = await prisma.user.update({
      where: { id: decoded.sub },
      data: { displayName: resolvedName },
      include: { userRoles: { include: { role: true } } },
    })

    return {
      kind: 'profileUpdated',
      user: {
        userId: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        roleId: updated.userRoles?.[0]?.roleId,
        status: updated.status,
      },
    }
  } catch {
    // invalid bearer token — fall through to body email
    return null
  }
}

// ─── Helper: extract email claim from a short-lived onboarding JWT ────────────

function resolveEmailFromOnboardingToken(token: string): string {
  try {
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET) as TokenClaims
    if (payload.type === 'onboarding' && payload.sub) {
      return payload.sub
    }
    throw new UnauthorizedError('Invalid or expired onboarding token')
  } catch {
    throw new UnauthorizedError('Invalid or expired onboarding token')
  }
}

/** Resolves identity from an onboarding or bearer token, then completes signup or updates the display name. */
export async function completeOnboardingFlow(params: {
  onboardingToken?: string
  displayName?: string
  authHeader?: string
  emailFromBody?: string
  ip: string
  userAgent: string
}): Promise<OnboardingFlowResult> {
  const resolvedName = (params.displayName || '').trim()
  if (!resolvedName) {
    throw new ValidationError('Display name is required')
  }

  let email: string | undefined

  if (params.onboardingToken) {
    email = resolveEmailFromOnboardingToken(params.onboardingToken)
  }

  if (!email) {
    const bearerResult = await resolveEmailFromBearer(params.authHeader, resolvedName)

    if (bearerResult && 'kind' in bearerResult) {
      return bearerResult as OnboardingFlowResult
    }

    email =
      (bearerResult && 'email' in bearerResult ? bearerResult.email : undefined) ??
      (typeof params.emailFromBody === 'string' ? params.emailFromBody : undefined)
  }

  if (!email) {
    throw new ValidationError('Onboarding token or authentication is required')
  }

  const result = await completeOnboarding(email, resolvedName, params.ip, params.userAgent)
  return { kind: 'signupCompleted', ...result }
}

// ─── Google OAuth (Sign in with Google) ───────────────────────────────────────

export async function googleLogin(
  idToken: string,
  ip: string,
  userAgent: string,
): Promise<
  | {
      requiresOnboarding: true
      onboardingToken: string
      defaultDisplayName: string
      user: null
      accessToken: null
      refreshToken: null
    }
  | {
      requiresOnboarding: false
      user: UserData
      accessToken: string
      refreshToken: string
      onboardingToken?: undefined
      defaultDisplayName?: undefined
    }
> {
  if (!GOOGLE_CLIENT_ID) {
    throw new UnauthorizedError('Google login is not configured on the server')
  }

  let payload
  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    })
    payload = ticket.getPayload()
  } catch {
    throw new UnauthorizedError('Invalid Google credentials')
  }

  if (!payload?.email || payload.email_verified === false) {
    throw new UnauthorizedError('Google account email is not verified')
  }

  const email = payload.email.toLowerCase().trim()
  const defaultDisplayName = (payload.name || email.split('@')[0]).trim()

  let user = await prisma.user.findUnique({
    where: { email },
    include: {
      userRoles: {
        include: { role: true },
      },
    },
  })

  if (!user) {
    const onboardingToken = signToken(
      { sub: email, type: 'onboarding' },
      ACCESS_TOKEN_SECRET,
      '15m',
    )

    return {
      requiresOnboarding: true,
      onboardingToken,
      defaultDisplayName,
      user: null,
      accessToken: null,
      refreshToken: null,
    }
  }

  if (user.userRoles.length === 0) {
    const analystRole = await prisma.role.findFirst({
      where: { name: RoleName.ANALYST },
    })

    if (analystRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: analystRole.id,
          assignedById: user.id,
        },
      })

      user = (await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          userRoles: { include: { role: true } },
        },
      }))!
    }
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedError('Account is inactive or suspended')
  }

  const { accessToken, refreshToken, jti } = await generateTokens(user.id)
  const refreshTokenExpiryMs =
    convertToMilliseconds(REFRESH_TOKEN_EXPIRY as string) || 604800000

  await prisma.userSession.create({
    data: {
      userId: user.id,
      jti,
      ipAddress: ip,
      userAgent,
      expiresAt: new Date(Date.now() + refreshTokenExpiryMs),
    },
  })

  return {
    requiresOnboarding: false,
    user: {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      roleId: user.userRoles?.[0]?.roleId,
      status: user.status,
    },
    accessToken,
    refreshToken,
  }
}
