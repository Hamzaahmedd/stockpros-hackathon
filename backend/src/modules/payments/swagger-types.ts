import {
  Body,
  Controller,
  Get,
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
  /** @example "CARD" */
  paymentMethod: 'CARD' | 'WALLET'
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

export interface SubscriptionSummaryResponse {
  /** @example "CARD" */
  paymentMethod: 'CARD' | 'WALLET'
  /** Always false for WALLET — wallets have no recurring capability. */
  autoRenew: boolean
  /** @example "ACTIVE" */
  status: 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'CANCELLED'
  /** ISO 8601, or null before the first webhook-confirmed payment lands. */
  currentPeriodEnd: string | null
  /** ISO 8601, set only while `status` is `GRACE`. */
  gracePeriodEnd: string | null
}

export interface ToggleAutoRenewRequest {
  enabled: boolean
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
   * Safepay webhook — a single endpoint handling two distinct event shapes:
   * (1) the one-time checkout notification, which confirms a payment
   * asynchronously and, on success, upgrades the paying user to Pro; and
   * (2) a Plan-based recurring-subscription event
   * (`payment.succeeded`/`payment.failed`), which extends or lapses a CARD
   * subscription's billing period (Phase 2 — see
   * modules/payments/client.ts's `createSubscriptionCheckout` doc comment
   * for the caveat that this shape is best-effort, not yet verified against
   * a live Safepay payload). Authenticated via the `x-sfpy-signature`
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

  /**
   * The caller's current billing-cycle state: renewal date, auto-renew
   * status, and whether they're in a grace period after a lapsed/failed
   * renewal. Only registered when `config.features.enablePaymentProcessor`
   * is on.
   */
  @Get('subscription')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Subscription fetched')
  @Response<ApiErrorResponse>(404, 'No subscription found')
  async getSubscription(): Promise<ApiResponse<SubscriptionSummaryResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * WALLET-only manual renewal ("Pay & Extend for 30 Days") — starts a fresh
   * one-time Safepay checkout the same way `create-checkout` does; the
   * period only actually extends once the webhook confirms payment.
   */
  @Post('subscription/renew')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Renewal checkout session created')
  async renewSubscription(): Promise<ApiResponse<CreateCheckoutResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Turns recurring card billing on/off. CARD subscriptions only — 400 if
   * the caller's subscription is WALLET (wallets have no recurring
   * capability to toggle).
   */
  @Post('subscription/auto-renew')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Auto-renew updated')
  @Response<ApiErrorResponse>(400, 'Not a card subscription')
  @Response<ApiErrorResponse>(404, 'No subscription found')
  async toggleAutoRenew(
    @Body() body: ToggleAutoRenewRequest,
  ): Promise<ApiResponse<SubscriptionSummaryResponse>> {
    throw new Error('tsoa spec-only')
  }
}
