import {
  Body,
  Controller,
  Path,
  Post,
  Response,
  Route,
  SuccessResponse,
  Tags,
} from 'tsoa'

import { ApiErrorResponse, ApiResponse } from '../../shared/docs-types'

// ─── SSO models ─────────────────────────────────────────────────────────────

export interface SsoStartRequest {
  /** @format email @example "analyst@fund.com" */
  email: string
}

export interface SsoStartResponse {
  /** Send the browser here to sign in at the organization's identity provider. */
  redirectUrl: string
  /** Keep this in the browser (session storage) and send it back with the code; it ties the sign-in to the browser that started it. */
  bindingToken: string
}

export interface SsoExchangeRequest {
  /** The one-time `code` from the redirect to `/auth/sso/complete`. */
  code: string
  bindingToken: string
}

export interface SsoSessionUser {
  userId: string
  /** @format email */
  email: string
  displayName: string | null
}

export interface SsoExchangeResponse {
  requiresOnboarding: boolean
  /** Present when `requiresOnboarding` is true. */
  onboardingToken?: string
  defaultDisplayName?: string
  accessToken?: string
  user?: SsoSessionUser
  requiresPhoneVerification?: boolean
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/v1/auth/sso')
@Tags('Single Sign-On')
export class SsoSwaggerController extends Controller {
  /**
   * Starts a SAML sign-in for an email whose domain has SSO enabled. Answers
   * 403 `FORBIDDEN_FEATURE_DISABLED` while SSO is switched off.
   */
  @Post('start')
  @Response<ApiErrorResponse>(400, 'SSO is not available for this email')
  async start(
    @Body() body: SsoStartRequest,
  ): Promise<ApiResponse<SsoStartResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * The ACS URL: the identity provider posts its `SAMLResponse` and
   * `RelayState` here as `application/x-www-form-urlencoded`. The browser is
   * always redirected (303) back to the app, to `/auth/sso/complete?code=…` on
   * success or an error state; failure details are never shown.
   */
  @Post('{tenantId}/acs')
  @SuccessResponse(303, 'Redirect back to the app')
  async acs(
    @Path() tenantId: string,
    @Body() body: { SAMLResponse: string; RelayState?: string },
  ): Promise<void> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Exchanges the one-time code (valid 60 seconds, single use) and the
   * browser's binding token for a session, setting the refresh cookie. New
   * users get an onboarding token instead.
   */
  @Post('exchange')
  @Response<ApiErrorResponse>(401, 'Invalid or expired SSO sign-in')
  async exchange(
    @Body() body: SsoExchangeRequest,
  ): Promise<ApiResponse<SsoExchangeResponse>> {
    throw new Error('tsoa spec-only')
  }
}
