import { Controller, Get, Post, Put, Delete, Patch, Route, Tags, Security, Body, Path, Query, SuccessResponse, Response, Request } from 'tsoa'

// ─── Shared response shapes ───────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean
  message: string
  data?: T
}

export interface ApiErrorResponse {
  success: false
  message: string
  errors?: Array<{ field: string; message: string }>
}

export interface PaginatedResponse<T> {
  success: boolean
  message: string
  data: {
    items: T[]
    total: number
    page: number
    limit: number
  }
}

// ─── Auth models ──────────────────────────────────────────────────────────────

export interface UserProfile {
  /** @example "usr_01j7xyz987" */
  id: string
  /** @format email @example "trader@example.com" */
  email: string
  /** @example "Alex Morgan" */
  displayName: string
  avatarUrl?: string | null
  country?: string | null
  /** @example "INTERMEDIATE" */
  tradingExperience?: string | null
  /** @example "MODERATE" */
  riskTolerance?: string | null
  isProfileComplete: boolean
  roles: string[]
  /** @format date-time */
  createdAt: string
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
  /** @format email @example "jordan@example.com" */
  email: string
  onboardingToken?: string
  /** @example "US" */
  country?: string
  /** @enum {string} @example "ADVANCED" */
  tradingExperience?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  preferredSectors?: string[]
  /** @enum {string} @example "AGGRESSIVE" */
  riskTolerance?: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'
}

export interface UpdateProfileRequest {
  displayName?: string
  country?: string
  tradingExperience?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  preferredSectors?: string[]
  riskTolerance?: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'
}

export interface AuthTokensResponse {
  accessToken: string
  user: UserProfile
}

export interface LoginRequest {
  /** @format email */
  email: string
  password: string
}

export interface RegisterRequest {
  /** @format email */
  email: string
  password: string
  displayName?: string
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Route('api/auth')
@Tags('Authentication')
export class AuthController extends Controller {
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
  @Post('magic-link/verify')
  @SuccessResponse(200, 'Magic link verified, tokens issued')
  @Response<ApiErrorResponse>(400, 'Invalid or expired token')
  async verifyMagicLink(@Body() body: VerifyMagicLinkRequest): Promise<ApiResponse<AuthTokensResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Authenticate via Google Identity Services (ID token credential).
   */
  @Post('google')
  @SuccessResponse(200, 'Google login successful')
  @Response<ApiErrorResponse>(401, 'Invalid Google credential')
  async googleLogin(@Body() body: GoogleLoginRequest): Promise<ApiResponse<AuthTokensResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Complete user onboarding after magic link / OAuth signup.
   */
  @Post('onboarding')
  @SuccessResponse(200, 'Onboarding completed')
  async completeOnboarding(@Body() body: OnboardingRequest): Promise<ApiResponse<UserProfile>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Rotate session — exchange a valid refresh_token cookie for a new access token.
   */
  @Post('refresh')
  @Security('cookieAuth')
  @SuccessResponse(200, 'Tokens refreshed')
  @Response<ApiErrorResponse>(401, 'Missing or expired refresh token')
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
   * Partially update the authenticated user's profile.
   */
  @Put('profile')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Profile updated')
  async updateProfile(@Body() body: UpdateProfileRequest): Promise<ApiResponse<UserProfile>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Upload a profile avatar image (multipart/form-data).
   */
  @Post('avatar')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Avatar uploaded')
  async uploadAvatar(): Promise<ApiResponse<{ avatarUrl: string }>> {
    throw new Error('tsoa spec-only')
  }
}
