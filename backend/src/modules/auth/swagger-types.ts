import {
  Controller,
  Delete,
  Get,
  Post,
  Route,
  Tags,
  Security,
  Body,
  SuccessResponse,
  Response,
} from 'tsoa'

import { ApiResponse, ApiErrorResponse } from '../../shared/docs-types'

// ─── Auth models ──────────────────────────────────────────────────────────────

export interface UserProfile {
  /** @example "018f2e1a-9c3d-7b2a-9f1e-2a3b4c5d6e7f" */
  userId: string
  /** @format email @example "trader@example.com" */
  email: string
  /** @example "Alex Morgan" */
  displayName: string | null
  userRoles: Array<{ role: { name: string } }>
}

export interface MagicLinkRequest {
  /** @format email @example "investor@stockpros.com" */
  email: string
}

export interface VerifyMagicLinkRequest {
  /** @example "d7a46f2c81e94a81b305e54d8b67..." */
  token: string
}

export interface GoogleLoginRequest {
  /** Google ID token credential string */
  credential: string
}

export interface OnboardingRequest {
  /** @example "Jordan Belfort" */
  displayName: string
  onboardingToken?: string
  /** @format email @example "jordan@example.com" */
  email?: string
}

export interface AuthTokensResponse {
  accessToken: string
  user: UserProfile
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/v1/auth')
@Tags('Authentication')
export class AuthSwaggerController extends Controller {
  /**
   * Send a magic link login email. A one-time link will be emailed to the address.
   */
  @Post('magic-link')
  @SuccessResponse(200, 'Magic link sent')
  @Response<ApiErrorResponse>(400, 'Invalid email')
  async sendMagicLink(@Body() body: MagicLinkRequest): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Verify a magic link token and return JWT access token + session cookie.
   */
  @Post('verify-magic-link')
  @SuccessResponse(200, 'Magic link verified, tokens issued')
  @Response<ApiErrorResponse>(400, 'Invalid or expired token')
  async verifyMagicLink(
    @Body() body: VerifyMagicLinkRequest,
  ): Promise<ApiResponse<AuthTokensResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Authenticate via Google Identity Services (ID token credential).
   */
  @Post('google')
  @SuccessResponse(200, 'Google login successful')
  @Response<ApiErrorResponse>(401, 'Invalid Google credential')
  async googleLogin(
    @Body() body: GoogleLoginRequest,
  ): Promise<ApiResponse<AuthTokensResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Complete user onboarding after magic link / OAuth signup.
   */
  @Post('onboarding')
  @SuccessResponse(200, 'Onboarding completed')
  async completeOnboarding(
    @Body() body: OnboardingRequest,
  ): Promise<ApiResponse<UserProfile>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Rotate session — exchange a valid refresh_token cookie for a new access token and rotated refresh token cookie.
   */
  @Post('refresh-token')
  @Security('cookieAuth')
  @SuccessResponse(200, 'Tokens refreshed and rotated')
  @Response<ApiErrorResponse>(401, 'Missing, expired, or invalid refresh token')
  async refresh(): Promise<ApiResponse<{ accessToken: string }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Invalidate the current session (clears the refresh_token cookie).
   */
  @Post('logout')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Logged out successfully')
  async logout(): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Fetch the authenticated user's full profile including roles and preferences.
   */
  @Get('me')
  @Security('bearerAuth')
  @SuccessResponse(200, 'User profile returned')
  @Response<ApiErrorResponse>(401, 'Unauthorized')
  async getMe(): Promise<ApiResponse<UserProfile>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Permanently delete (anonymize) the authenticated user's account.
   */
  @Delete('account')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Account deleted')
  async deleteAccount(): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }
}
