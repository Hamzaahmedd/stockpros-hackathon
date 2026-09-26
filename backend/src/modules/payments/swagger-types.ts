import {
  Body,
  Controller,
  Post,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'

import { ApiErrorResponse, ApiResponse } from '../../shared/docs-types'

// ─── Payments models ────────────────────────────────────────────────────────

export interface CreateCheckoutRequest {
  /** Only PRO is purchasable today. @example "PRO" */
  plan: 'PRO'
}

export interface CreateCheckoutResponse {
  /** Safepay hosted-checkout URL to redirect the browser to. */
  checkoutUrl: string
  /** Safepay's own tracker/session token — also returned to the frontend as `tracker_id` on redirect. */
  trackerId: string
}

export interface VerifyTrackerRequest {
  /** @example "C5A5APSBCV41R2QF2MHG" */
  trackerId: string
}

export interface VerifyTrackerResponse {
  trackerId: string
  /** @example "COMPLETED" */
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  /** @example "PRO" */
  plan: 'FREE' | 'PRO'
}

// ─── Controller (TSOA spec-only — not used at runtime) ─────────────────────

@Route('api/v1/payments')
@Tags('Payments')
export class PaymentsSwaggerController extends Controller {
  /**
   * Initiates a Safepay hosted-checkout session for upgrading to Pro.
   * Only registered when `config.features.enablePaymentProcessor` is on
   * (Payment Mode) — in Bypass Mode this route does not exist (404) and
   * `POST /api/v1/auth/plan` is used directly instead.
   */
  @Post('create-checkout')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Checkout session created')
  @Response<ApiErrorResponse>(400, 'Invalid plan value')
  async createCheckout(
    @Body() body: CreateCheckoutRequest,
  ): Promise<ApiResponse<CreateCheckoutResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Safepay webhook — confirms a payment asynchronously and, on success,
   * upgrades the paying user to Pro. Authenticated via the `x-sfpy-signature`
   * HMAC-SHA512 header, not a bearer token. Always registered regardless of
   * `enablePaymentProcessor`, so a late-arriving webhook is still recorded.
   */
  @Post('safepay/webhook')
  @SuccessResponse(200, 'Webhook received')
  @Response<ApiErrorResponse>(401, 'Invalid or missing webhook signature')
  async safepayWebhook(): Promise<{ received: true }> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Frontend post-redirect status check for a checkout tracker — used since
   * the webhook confirmation may lag the browser's redirect back from
   * Safepay's hosted checkout page.
   */
  @Post('verify-tracker')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Transaction status fetched')
  @Response<ApiErrorResponse>(403, 'Transaction does not belong to the caller')
  @Response<ApiErrorResponse>(404, 'Payment transaction not found')
  async verifyTracker(
    @Body() body: VerifyTrackerRequest,
  ): Promise<ApiResponse<VerifyTrackerResponse>> {
    throw new Error('tsoa spec-only')
  }
}
