import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from '@tsoa/runtime'
import config from '@/config'
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express'
import {
  completeOnboardingFlow,
  fetchMe,
  generateMagicLink,
  googleLogin as googleLoginService,
  logoutUser,
  refreshAccessToken,
  verifyMagicLink,
} from './service'
import { AuthenticatedRequest, MeProfile } from './types'
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  validateOrThrow,
} from '../../shared/errors'
import { defaultCookieOptions } from '../../shared/infrastructure/config/cookie'
import { convertToMilliseconds, getUserId } from '../../shared/utils'
import { emailValidator, googleLoginValidator } from './validation'

export interface AuthApiResponse<T = any> {
  success: boolean
  message: string
  user?: T
  accessToken?: string
  requiresOnboarding?: boolean
  onboardingToken?: string
}

export interface RequestMagicLinkBody {
  email: string
}

export interface VerifyMagicLinkBody {
  token: string
}

export interface CompleteOnboardingBody {
  onboardingToken?: string
  displayName?: string
  email?: string
}

export interface GoogleLoginBody {
  credential: string
}

export interface RefreshTokenBody {
  refresh_token?: string
}

export interface LogoutBody {
  refresh_token?: string
}

@Tags('Authentication')
@Route('api/v1/auth')
export class AuthController extends Controller {
  /**
   * Get currently authenticated user details and assigned roles.
   */
  @Get('me')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async getMyInfo(
    @Request() req: ExpressRequest,
  ): Promise<AuthApiResponse<MeProfile>> {
    const userId = getUserId(req)
    const myDetails = await fetchMe(userId)
    return {
      success: true,
      message: 'My details fetched successfully',
      user: myDetails,
    }
  }

  /**
   * Request a magic login/signup link sent via email.
   */
  @Post('magic-link')
  @SuccessResponse(200, 'Success')
  public async requestMagicLink(
    @Request() req: ExpressRequest,
    @Body() body: RequestMagicLinkBody,
  ): Promise<AuthApiResponse<void>> {
    const { email } = validateOrThrow(emailValidator, body)
    const clientOrigin =
      req.get('origin') ||
      (req.get('referer') ? new URL(req.get('referer')!).origin : undefined)
    await generateMagicLink(email, clientOrigin)
    return {
      success: true,
      message:
        'If an account with that email exists or can be created, a magic link has been sent.',
    }
  }

  /**
   * Verify a magic link token to log in or proceed to onboarding.
   */
  @Post('verify-magic-link')
  @SuccessResponse(200, 'Success')
  public async verifyMagicLinkToken(
    @Request() req: ExpressRequest,
    @Body() body: VerifyMagicLinkBody,
  ): Promise<AuthApiResponse<any>> {
    const { token } = body
    if (!token || typeof token !== 'string') {
      throw new ValidationError('Invalid token')
    }

    const loginResult = await verifyMagicLink(
      token,
      req.ip || 'Unknown',
      req.headers['user-agent'] || 'Unknown',
    )

    if (loginResult.requiresOnboarding) {
      return {
        success: true,
        message: 'Onboarding required to complete registration',
        requiresOnboarding: true,
        onboardingToken: loginResult.onboardingToken,
      }
    }

    const REFRESH_TOKEN_EXPIRY = convertToMilliseconds(
      config.auth.refreshTokenExpiry,
    )

    const res = (req as any).res as ExpressResponse
    if (res && res.cookie) {
      res.cookie('refresh_token', loginResult.refreshToken, {
        ...defaultCookieOptions,
        maxAge: REFRESH_TOKEN_EXPIRY,
      })
    }

    return {
      success: true,
      message: 'Login successful via magic link',
      requiresOnboarding: false,
      user: loginResult.user,
      accessToken: loginResult.accessToken,
    }
  }

  /**
   * Complete new user onboarding or update user profile.
   */
  @Post('onboarding')
  @SuccessResponse(200, 'Success')
  public async completeOnboarding(
    @Request() req: ExpressRequest,
    @Body() body: CompleteOnboardingBody,
  ): Promise<AuthApiResponse<any>> {
    const result = await completeOnboardingFlow({
      onboardingToken: body.onboardingToken,
      displayName: body.displayName,
      emailFromBody: body.email,
      authHeader: req.headers.authorization,
      ip: req.ip || 'Unknown',
      userAgent: req.headers['user-agent'] || 'Unknown',
    })

    if (result.kind === 'profileUpdated') {
      return {
        success: true,
        message: 'Onboarding completed successfully',
        user: result.user,
      }
    }

    const REFRESH_TOKEN_EXPIRY = convertToMilliseconds(
      config.auth.refreshTokenExpiry,
    )

    const res = (req as any).res as ExpressResponse
    if (res && res.cookie) {
      res.cookie('refresh_token', result.refreshToken, {
        ...defaultCookieOptions,
        maxAge: REFRESH_TOKEN_EXPIRY,
      })
    }

    this.setStatus(201)
    return {
      success: true,
      message: 'Account created successfully',
      user: result.user,
      accessToken: result.accessToken,
    }
  }

  /**
   * Authenticate using Google OAuth 2.0 credential.
   */
  @Post('google')
  @SuccessResponse(200, 'Success')
  public async googleLogin(
    @Request() req: ExpressRequest,
    @Body() body: GoogleLoginBody,
  ): Promise<AuthApiResponse<any>> {
    const { credential } = validateOrThrow(googleLoginValidator, body)

    const loginResult = await googleLoginService(
      credential,
      req.ip || 'Unknown',
      req.headers['user-agent'] || 'Unknown',
    )

    const REFRESH_TOKEN_EXPIRY = convertToMilliseconds(
      config.auth.refreshTokenExpiry,
    )

    const res = (req as any).res as ExpressResponse
    if (res && res.cookie) {
      res.cookie('refresh_token', loginResult.refreshToken, {
        ...defaultCookieOptions,
        maxAge: REFRESH_TOKEN_EXPIRY,
      })
    }

    return {
      success: true,
      message: 'Login successful via Google',
      user: loginResult.user,
      accessToken: loginResult.accessToken,
    }
  }

  /**
   * Refresh JWT access token using the HTTP-only refresh token cookie or body token.
   */
  @Post('refresh-token')
  @SuccessResponse(200, 'Success')
  public async refreshToken(
    @Request() req: ExpressRequest,
    @Body() body?: RefreshTokenBody,
  ): Promise<{ success: boolean; message: string; accessToken: string }> {
    const refreshToken = (req as any).cookies?.refresh_token || body?.refresh_token
    if (!refreshToken) {
      throw new UnauthorizedError('No refresh token provided')
    }

    const accessToken = await refreshAccessToken(refreshToken)
    return {
      success: true,
      message: 'Access token refreshed successfully',
      accessToken,
    }
  }

  /**
   * Log out user and revoke refresh session.
   */
  @Post('logout')
  @SuccessResponse(200, 'Success')
  public async logout(
    @Request() req: ExpressRequest,
    @Body() body?: LogoutBody,
  ): Promise<{ success: boolean; message: string }> {
    const refreshToken = (req as any).cookies?.refresh_token || body?.refresh_token
    if (!refreshToken) {
      throw new NotFoundError('No refresh token provided')
    }

    await logoutUser(refreshToken)

    const res = (req as any).res as ExpressResponse
    if (res && res.clearCookie) {
      res.clearCookie('refresh_token', defaultCookieOptions)
    }

    return {
      success: true,
      message: 'Logged out successfully',
    }
  }
}
