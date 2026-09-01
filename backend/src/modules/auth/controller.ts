import config from '@/config'
import { NextFunction, Request, Response } from 'express'
import {
    NotFoundError,
    UnauthorizedError,
    validateOrThrow,
    ValidationError,
} from '../../shared/errors'
import { defaultCookieOptions } from '../../shared/infrastructure/config/cookie'
import { convertToMilliseconds, getUserId } from '../../shared/utils'
import {
    completeOnboardingFlow,
    fetchMe,
    generateMagicLink,
    googleLogin as googleLoginService,
    logoutUser,
    refreshAccessToken,
    verifyMagicLink,
} from './service'
import { AuthenticatedRequest } from './types'
import { emailValidator, googleLoginValidator } from './validation'

export const getMyInfo = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getUserId(req)
    const myDetails = await fetchMe(userId)

    return res.status(200).json({
      success: true,
      message: 'My details fetched successfully',
      user: myDetails,
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
    const refreshToken = req.cookies.refresh_token
    if (!refreshToken) {
      throw new UnauthorizedError('No refresh token provided')
    }

    const accessToken = await refreshAccessToken(refreshToken)

    return res.status(200).json({
      success: true,
      message: 'Access token refreshed successfully',
      accessToken,
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

    return res
      .status(200)
      .json({ success: true, message: 'Logged out successfully' })
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

    return res.status(200).json({
      success: true,
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
    const { token } = req.body
    if (!token || typeof token !== 'string') {
      throw new ValidationError('Invalid token')
    }

    const loginResult = await verifyMagicLink(
      token,
      req.ip || 'Unknown',
      req.headers['user-agent'] || 'Unknown',
    )

    if (loginResult.requiresOnboarding) {
      return res.status(200).json({
        success: true,
        message: 'Onboarding required to complete registration',
        requiresOnboarding: true,
        onboardingToken: loginResult.onboardingToken,
      })
    }

    const REFRESH_TOKEN_EXPIRY = convertToMilliseconds(
      config.auth.refreshTokenExpiry,
    )

    return res
      .status(200)
      .cookie('refresh_token', loginResult.refreshToken, {
        ...defaultCookieOptions,
        maxAge: REFRESH_TOKEN_EXPIRY,
      })
      .json({
        success: true,
        message: 'Login successful via magic link',
        requiresOnboarding: false,
        user: loginResult.user,
        accessToken: loginResult.accessToken,
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
    const { onboardingToken, displayName, email } = req.body

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
      return res.status(200).json({
        success: true,
        message: 'Onboarding completed successfully',
        user: result.user,
      })
    }

    // New signup: issue the session cookie + access token.
    const REFRESH_TOKEN_EXPIRY = convertToMilliseconds(
      config.auth.refreshTokenExpiry,
    )

    return res
      .status(201)
      .cookie('refresh_token', result.refreshToken, {
        ...defaultCookieOptions,
        maxAge: REFRESH_TOKEN_EXPIRY,
      })
      .json({
        success: true,
        message: 'Account created successfully',
        user: result.user,
        accessToken: result.accessToken,
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
      return res.status(200).json({
        success: true,
        message: 'Onboarding required to complete Google registration',
        requiresOnboarding: true,
        onboardingToken: loginResult.onboardingToken,
        defaultDisplayName: loginResult.defaultDisplayName,
      })
    }

    const REFRESH_TOKEN_EXPIRY = convertToMilliseconds(
      config.auth.refreshTokenExpiry,
    )

    return res
      .status(200)
      .cookie('refresh_token', loginResult.refreshToken, {
        ...defaultCookieOptions,
        maxAge: REFRESH_TOKEN_EXPIRY,
      })
      .json({
        success: true,
        message: 'Login successful via Google',
        requiresOnboarding: false,
        user: loginResult.user,
        accessToken: loginResult.accessToken,
      })
  } catch (error) {
    next(error)
  }
}
