import config from '@/config'
import { NextFunction, Request, Response } from 'express'
import {
  NotFoundError,
  UnauthorizedError,
  validateOrThrow,
  ValidationError,
} from '../../shared/errors'
import { defaultCookieOptions } from '../../shared/infrastructure/config/cookie'
import { convertToMilliseconds, getUserId, sendSuccess } from '../../shared/utils'
import {
  completeOnboardingFlow,
  deleteAccount as deleteAccountService,
  fetchMe,
  generateMagicLink,
  googleLogin as googleLoginService,
  logoutUser,
  refreshAccessToken,
  verifyMagicLink,
} from './service'
import { AuthenticatedRequest } from './types'
import {
  completeOnboardingValidator,
  emailValidator,
  googleLoginValidator,
  magicLinkTokenValidator,
} from './validation'

export const getMyInfo = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const myDetails = await fetchMe(userId)

    return sendSuccess(res, {
      message: 'My details fetched successfully',
      extra: { user: myDetails },
    })
  } catch (error) {
    next(error)
  }
}

export const refreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const incomingRefreshToken =
      req.cookies?.refresh_token || req.body?.refresh_token
    if (!incomingRefreshToken) {
      throw new UnauthorizedError('No refresh token provided')
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await refreshAccessToken(incomingRefreshToken)

    const REFRESH_TOKEN_EXPIRY = convertToMilliseconds(
      config.auth.refreshTokenExpiry,
    )

    res.cookie('refresh_token', newRefreshToken, {
      ...defaultCookieOptions,
      maxAge: REFRESH_TOKEN_EXPIRY,
    })

    return sendSuccess(res, {
      message: 'Tokens refreshed successfully',
      extra: { accessToken },
    })
  } catch (error) {
    next(error)
  }
}

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const refreshToken = req.cookies?.refresh_token || req.body?.refresh_token
    if (!refreshToken) {
      throw new NotFoundError('No refresh token provided')
    }

    await logoutUser(refreshToken)

    res.clearCookie('refresh_token', defaultCookieOptions)

    return sendSuccess(res, { message: 'Logged out successfully' })
  } catch (error) {
    next(error)
  }
}

// ─── Account Deletion ─────────────────────────────────────────────────────────

export const deleteAccount = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const { confirmationPhrase } = req.body

    if (
      typeof confirmationPhrase !== 'string' ||
      confirmationPhrase.trim() !== 'DELETE MY ACCOUNT'
    ) {
      throw new ValidationError(
        'You must type "DELETE MY ACCOUNT" exactly to confirm deletion',
      )
    }

    await deleteAccountService(userId)

    // Clear the refresh-token cookie so the browser session dies immediately
    res.clearCookie('refresh_token', defaultCookieOptions)

    return sendSuccess(res, {
      message: 'Your account has been permanently deleted.',
    })
  } catch (error) {
    next(error)
  }
}

// ─── Magic Link & Onboarding ──────────────────────────────────────────────────

export const requestMagicLink = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = validateOrThrow(emailValidator, req.body)
    const clientOrigin =
      req.get('origin') ||
      (req.get('referer') ? new URL(req.get('referer')!).origin : undefined)
    await generateMagicLink(email, clientOrigin)

    return sendSuccess(res, {
      message:
        'If an account with that email exists or can be created, a magic link has been sent.',
    })
  } catch (error) {
    next(error)
  }
}

export const verifyMagicLinkToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { token } = validateOrThrow(magicLinkTokenValidator, req.body)

    const loginResult = await verifyMagicLink(
      token,
      req.ip || 'Unknown',
      req.headers['user-agent'] || 'Unknown',
    )

    if (loginResult.requiresOnboarding) {
      return sendSuccess(res, {
        message: 'Onboarding required to complete registration',
        extra: {
          requiresOnboarding: true,
          onboardingToken: loginResult.onboardingToken,
        },
      })
    }

    const REFRESH_TOKEN_EXPIRY = convertToMilliseconds(
      config.auth.refreshTokenExpiry,
    )

    res.cookie('refresh_token', loginResult.refreshToken, {
      ...defaultCookieOptions,
      maxAge: REFRESH_TOKEN_EXPIRY,
    })

    return sendSuccess(res, {
      message: 'Login successful via magic link',
      extra: {
        requiresOnboarding: false,
        user: loginResult.user,
        accessToken: loginResult.accessToken,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const completeOnboardingHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { onboardingToken, displayName, email } = validateOrThrow(
      completeOnboardingValidator,
      req.body,
    )

    const result = await completeOnboardingFlow({
      onboardingToken,
      displayName,
      emailFromBody: email,
      authHeader: req.headers.authorization,
      ip: req.ip || 'Unknown',
      userAgent: req.headers['user-agent'] || 'Unknown',
    })

    // Already-created user (authenticated via bearer token): confirm the update.
    if (result.kind === 'profileUpdated') {
      return sendSuccess(res, {
        message: 'Onboarding completed successfully',
        extra: { user: result.user },
      })
    }

    // New signup: issue the session cookie + access token.
    const REFRESH_TOKEN_EXPIRY = convertToMilliseconds(
      config.auth.refreshTokenExpiry,
    )

    res.cookie('refresh_token', result.refreshToken, {
      ...defaultCookieOptions,
      maxAge: REFRESH_TOKEN_EXPIRY,
    })

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Account created successfully',
      extra: { user: result.user, accessToken: result.accessToken },
    })
  } catch (error) {
    next(error)
  }
}

// ─── Google OAuth ──────────────────────────────────────────────────────────────

export const googleLogin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { credential } = validateOrThrow(googleLoginValidator, req.body)

    const loginResult = await googleLoginService(
      credential,
      req.ip || 'Unknown',
      req.headers['user-agent'] || 'Unknown',
    )

    if (loginResult.requiresOnboarding) {
      return sendSuccess(res, {
        message: 'Onboarding required to complete Google registration',
        extra: {
          requiresOnboarding: true,
          onboardingToken: loginResult.onboardingToken,
          defaultDisplayName: loginResult.defaultDisplayName,
        },
      })
    }

    const REFRESH_TOKEN_EXPIRY = convertToMilliseconds(
      config.auth.refreshTokenExpiry,
    )

    res.cookie('refresh_token', loginResult.refreshToken, {
      ...defaultCookieOptions,
      maxAge: REFRESH_TOKEN_EXPIRY,
    })

    return sendSuccess(res, {
      message: 'Login successful via Google',
      extra: {
        requiresOnboarding: false,
        user: loginResult.user,
        accessToken: loginResult.accessToken,
      },
    })
  } catch (error) {
    next(error)
  }
}
