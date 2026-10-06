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
import type { AnnouncementBoot } from '../announcements/public'

// ─── Auth models ──────────────────────────────────────────────────────────────

export interface UserProfile {
  /** @example "018f2e1a-9c3d-7b2a-9f1e-2a3b4c5d6e7f" */
  userId: string
  /** @format email @example "trader@example.com" */
  email: string
  /** @example "Alex Morgan" */
  displayName: string | null
  userRoles: Array<{ role: { name: string } }>
  /** Subscription tier. Set directly (Bypass Mode) or via Safepay-confirmed checkout (Payment Mode) depending on `enablePaymentProcessor`. @example "FREE" */
  plan: 'FREE' | 'PRO'
  /** Internal staff access level; USER for regular customers. @example "USER" */
  platformRole: 'USER' | 'SUPPORT_AGENT' | 'PLATFORM_ADMIN' | 'SUPER_ADMIN'
  /** Role in the active workspace; null for solo accounts. @example null */
  workspaceRole: 'OWNER' | 'ADMIN' | 'MEMBER' | null
}

export interface MeResponse extends ApiResponse<UserProfile> {
  user: UserProfile
  pricingTiersEnabled: boolean
  enablePaymentProcessor: boolean
  /** Announcements for the caller (modal, banner, spotlight, badges, changelog). Null when `features.enableAnnouncements` is off or loading them failed. */
  announcements: AnnouncementBoot | null
}

export interface SetPlanRequest {
  /** @example "PRO" */
  plan: 'FREE' | 'PRO'
}

export interface SetPlanResponse {
  /** @example "PRO" */
  plan: 'FREE' | 'PRO'
}

/** Which sign-in methods a user's organization accepts. */
export interface LoginOptionsResponse {
  /** ANY when the email's domain is unrestricted, unknown or public. @example "GOOGLE_ONLY" */
  authPolicy: 'ANY' | 'GOOGLE_ONLY' | 'GOOGLE_WORKSPACE' | 'SAML_SSO'
  /** True when the email's domain has SSO enabled, so the login screen can offer "Continue with SSO". */
  ssoAvailable: boolean
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
  /** Issued after a verified magic link or Google sign-in; required to create an account. */
  onboardingToken?: string
}

export interface AuthTokensResponse {
  accessToken: string
  user: UserProfile
  /** True when the user still needs to complete WhatsApp OTP phone verification. */
  requiresPhoneVerification?: boolean
}

export interface RequestPhoneOtpRequest {
  /** Accepts 03XXXXXXXXX, 923XXXXXXXXX, or +923XXXXXXXXX; normalized server-side. @example "+923001234567" */
  phoneNumber: string
}

export interface VerifyPhoneOtpRequest {
  /** 6-digit code sent via WhatsApp. @example "123456" */
  code: string
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
  @Response<ApiErrorResponse>(
    403,
    "The email's organization requires Google sign-in (errorCode LOGIN_METHOD_REQUIRED)",
  )
  async sendMagicLink(@Body() body: MagicLinkRequest): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Tells the login screen which sign-in methods the email's organization
   * accepts (a verified domain can require Google, Google Workspace or SSO). Only
   * the policy and whether SSO is available are returned; always `ANY` for unknown or public domains.
   */
  @Post('login-options')
  @SuccessResponse(200, 'Login options')
  @Response<ApiErrorResponse>(400, 'Invalid email')
  async loginOptions(
    @Body() body: MagicLinkRequest,
  ): Promise<ApiResponse<LoginOptionsResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Verify a magic link token and return JWT access token + session cookie.
   * Refused with 403 `LOGIN_METHOD_REQUIRED` when the email's organization requires Google sign-in.
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
  @Response<ApiErrorResponse>(
    403,
    'The organization requires a Google Workspace account (errorCode LOGIN_METHOD_REQUIRED)',
  )
  async googleLogin(
    @Body() body: GoogleLoginRequest,
  ): Promise<ApiResponse<AuthTokensResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Complete user onboarding after magic link / OAuth signup. Refused with
   * 403 `LOGIN_METHOD_REQUIRED` when the email's organization requires Google sign-in
   * and the onboarding token was not issued by it.
   */
  @Post('onboarding')
  @SuccessResponse(200, 'Onboarding completed')
  @Response<ApiErrorResponse>(
    401,
    'No valid onboarding token or bearer token (an email in the body is never accepted)',
  )
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
  async getMe(): Promise<MeResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Self-serve plan change — set the authenticated user's own subscription tier.
   * Only registered/enforced when `pricingTiersEnabled` is on for this environment.
   * In Bypass Mode (`enablePaymentProcessor` off) this directly assigns PRO or FREE.
   * In Payment Mode (`enablePaymentProcessor` on), PRO is rejected here (403) —
   * upgrades must go through `POST /api/v1/payments/create-checkout` and a
   * webhook-confirmed Safepay payment instead; downgrading to FREE stays allowed.
   */
  @Post('plan')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Plan updated successfully')
  @Response<ApiErrorResponse>(400, 'Invalid plan value')
  @Response<ApiErrorResponse>(
    403,
    'PRO upgrades require Safepay checkout when payment processing is enabled',
  )
  async setPlan(
    @Body() body: SetPlanRequest,
  ): Promise<ApiResponse<SetPlanResponse>> {
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

  /**
   * Request a WhatsApp OTP be sent to the given Pakistani phone number (rate-limited; 60s cooldown between requests).
   */
  @Post('phone-verification/request')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Verification code sent via WhatsApp')
  @Response<ApiErrorResponse>(429, 'Cooldown active or rate limit exceeded')
  async requestPhoneOtp(
    @Body() body: RequestPhoneOtpRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Verify the WhatsApp OTP code and mark the authenticated user's phone number as verified.
   */
  @Post('phone-verification/verify')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Phone number verified successfully')
  @Response<ApiErrorResponse>(400, 'Invalid or expired code')
  async verifyPhoneOtp(
    @Body() body: VerifyPhoneOtpRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }
}
