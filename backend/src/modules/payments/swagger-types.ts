import {
  Body,
  Controller,
  Get,
  Path,
  Post,
  Put,
  Query,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'

import { ApiErrorResponse, ApiResponse } from '../../shared/docs-types'

// ─── Payments models ────────────────────────────────────────────────────────

export interface CreateProCheckoutRequest {
  /** @example "PRO" */
  plan: 'PRO'
  /** @example "CARD" */
  paymentMethod: 'CARD' | 'WALLET'
}

export interface CreateTeamCheckoutRequest {
  /** @example "TEAM" */
  plan: 'TEAM'
  /**
   * Seats to buy, 2–150. Price = seatCount × 749,900 paisa (Rs 7,499/seat/mo),
   * derived server-side.
   * @isInt
   * @minimum 2
   * @maximum 150
   * @example 10
   */
  seatCount: number
  /** @example "Alpha Fund" */
  teamName: string
}

export interface CreateTopupCheckoutRequest {
  /** @example "TOPUP" */
  plan: 'TOPUP'
  /**
   * Prepaid credit pack: PACK_500 (Rs 500 = 10 signals), PACK_1000 (Rs 1,000 =
   * 20), PACK_2500 (Rs 2,500 = 50). Credits the team pool when the caller is a
   * team owner/admin, otherwise the caller's own balance (PRO only).
   * @example "PACK_1000"
   */
  packId: 'PACK_500' | 'PACK_1000' | 'PACK_2500'
}

export type CreateCheckoutRequest =
  | CreateProCheckoutRequest
  | CreateTeamCheckoutRequest
  | CreateTopupCheckoutRequest

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
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REFUNDED'
  /** @example "PRO" */
  plan: 'FREE' | 'PRO' | 'TEAM'
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

export interface UsageQuotaResponse {
  /** AI signals included per billing cycle (Pro 300, Team seat 375). */
  limit: number
  used: number
  remaining: number
  windowStart: string
  /** When the allowance resets; in the past during a grace period. */
  windowEnd: string | null
  /** @example "SUBSCRIPTION_PERIOD" */
  windowSource: 'SUBSCRIPTION_PERIOD' | 'CALENDAR_MONTH'
}

export interface UsageCreditsResponse {
  pool: 'USER' | 'TEAM'
  balanceInPaisa: number
  costPerSignalPaisa: number
  signalsAvailable: number
  /** False for plain team members, who cannot buy credits. */
  canTopUp: boolean
  /** True for individual Pro users, who set their own limit; members' limits are set by workspace admins. */
  canSetSpendCap: boolean
}

export interface SetSpendCapRequest {
  /**
   * Most credit (in paisa) to spend per billing cycle, 5,000 (one signal) to
   * 10,000,000; `null` removes the limit.
   * @example 100000
   */
  monthlyLimitPaisa: number | null
}

export interface UsageSpendCapResponse {
  monthlyLimitPaisa: number
  spentPaisa: number
  remainingPaisa: number
}

export interface UsageSummaryResponse {
  plan: 'FREE' | 'PRO' | 'TEAM'
  /** False for FREE (daily quotas apply instead, so there is no monthly meter). */
  metered: boolean
  quota: UsageQuotaResponse | null
  credits: UsageCreditsResponse | null
  /** Present only when a monthly credit cap applies (a member's, or the individual's own). */
  spendCap: UsageSpendCapResponse | null
}

export interface UsageHistoryDayResponse {
  /**
   * Calendar day in the requested time zone.
   * @example "2026-10-06"
   */
  date: string
  signals: number
  creditSpentPaisa: number
}

export interface UsageHistoryFeatureResponse {
  /** @example "ai_forecast" */
  feature: 'ai_forecast' | 'ai_decision'
  signals: number
  creditSpentPaisa: number
}

export interface UsageHistoryWindowResponse {
  start: string
  /** When the allowance resets; null only if it cannot be determined. */
  end: string | null
  /** @example "SUBSCRIPTION_PERIOD" */
  source: 'SUBSCRIPTION_PERIOD' | 'CALENDAR_MONTH'
}

export interface UsageHistoryResponse {
  plan: 'FREE' | 'PRO' | 'TEAM'
  /** False for FREE (daily quotas apply instead), in which case there is no history. */
  metered: boolean
  /** `TEAM` = whole workspace (owner/admin); `USER` = the caller's own usage. Null when not metered. */
  scope: 'USER' | 'TEAM' | null
  /** @example "current" */
  range: 'current' | 'previous'
  /** Time zone the daily buckets were cut in. */
  timezone: string
  window: UsageHistoryWindowResponse | null
  totals: { signals: number; creditSpentPaisa: number }
  /** Every calendar day of the window so far, zero-filled, oldest first. */
  daily: UsageHistoryDayResponse[]
  byFeature: UsageHistoryFeatureResponse[]
}

export interface CreditLedgerEntryResponse {
  id: string
  /** Signed paisa: purchases/refunds positive, overage consumption negative. */
  amountPaisa: number
  /** @example "OVERAGE_CONSUMPTION" */
  type: 'PURCHASE' | 'OVERAGE_CONSUMPTION' | 'REFUND'
  description: string
  createdAt: string
  /** True when the movement was on the shared workspace pool. */
  isTeamPool: boolean
  /** Workspace-wide view only. */
  memberName?: string
}

export interface CreditLedgerPageResponse {
  scope: 'USER' | 'TEAM'
  balanceInPaisa: number
  entries: CreditLedgerEntryResponse[]
  /** Pass back as `cursor` for the next (older) page; null when done. */
  nextCursor: string | null
}

export interface ToggleAutoRenewRequest {
  enabled: boolean
  /**
   * `TEAM` targets the caller's workspace subscription (owner/admin only).
   * Team seats are renewed manually, so this only sets the flag — it never
   * schedules a charge. Defaults to `USER`.
   */
  scope?: 'USER' | 'TEAM'
}

// ─── Controller (TSOA spec-only — not used at runtime) ─────────────────────

export interface TeamTransactionResponse {
  id: string
  /** @example "SP-2030-456789AB" */
  referenceNumber: string
  kind: 'SUBSCRIPTION' | 'SEAT_ADDITION' | 'TOPUP'
  description: string
  status: 'COMPLETED' | 'REFUNDED'
  amountPaisa: number
  currency: string
  seatCount: number
  createdAt: string
}

export interface TeamTransactionsPageResponse {
  entries: TeamTransactionResponse[]
  nextCursor: string | null
}

export interface TeamReceiptResponse {
  id: string
  referenceNumber: string
  kind: 'SUBSCRIPTION' | 'SEAT_ADDITION' | 'TOPUP'
  description: string
  status: 'COMPLETED' | 'REFUNDED'
  amountPaisa: number
  currency: string
  seatCount: number
  /** Per-seat price; null for credit top-ups. */
  unitPricePaisa: number | null
  paymentMethod: string | null
  paidAt: string
  teamName: string
  /** The billing contact, or the owner's email when none is set. */
  billedTo: string
}

@Route('api/v1/payments')
@Tags('Payments')
export class PaymentsSwaggerController extends Controller {
  /**
   * Initiates a Safepay hosted-checkout session for upgrading to Pro, buying
   * a Team workspace (`plan: TEAM`), or topping up prepaid credits
   * (`plan: TOPUP`). Prices are always derived server-side.
   * Only registered when `config.features.enablePaymentProcessor` is on
   * (Payment Mode) — in Bypass Mode this route does not exist (404) and
   * `POST /api/v1/auth/plan` is used directly instead.
   */
  @Post('create-checkout')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Checkout session created')
  @Response<ApiErrorResponse>(400, 'Invalid plan value')
  @Response<ApiErrorResponse>(
    403,
    'Not allowed (restricted domain, non-admin top-up, FREE top-up)',
  )
  @Response<ApiErrorResponse>(409, 'Already part of a team workspace')
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
  // `?scope=TEAM` returns the workspace subscription (owner/admin only).
  @SuccessResponse(200, 'Subscription fetched')
  @Response<ApiErrorResponse>(404, 'No subscription found')
  async getSubscription(): Promise<ApiResponse<SubscriptionSummaryResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * The caller's allowance for the current cycle: AI signals used vs. included,
   * the credit pool that pays beyond it, and any team spend cap. Same window
   * and counting as enforcement. Always registered.
   */
  @Get('me/usage')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Usage fetched')
  async getMyUsage(): Promise<ApiResponse<UsageSummaryResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Sets or removes the caller's own monthly limit on credit spend. Individual
   * Pro users only: workspace members are limited by their admins, and FREE has
   * no credits. Once reached, AI signals past the included allowance are
   * refused with `OVERAGE_REQUIRED` / `PERSONAL_SPEND_LIMIT_REACHED` until the
   * next cycle or until the limit is raised. Returns the refreshed usage summary.
   */
  @Put('credits/spend-cap')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Spending limit updated')
  @Response<ApiErrorResponse>(400, 'Invalid limit')
  @Response<ApiErrorResponse>(
    403,
    'FREE plan, or a workspace member (admins set those limits)',
  )
  async setSpendCap(
    @Body() body: SetSpendCapRequest,
  ): Promise<ApiResponse<UsageSummaryResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Daily AI-signal usage for the current (or previous) billing cycle, with a
   * per-feature breakdown, zero-filled by calendar day in the caller's time
   * zone. A workspace owner/admin gets the whole workspace; a plain member or a
   * Pro user gets their own usage. FREE returns `metered: false`. Always registered.
   */
  @Get('me/usage/history')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Usage history fetched')
  @Response<ApiErrorResponse>(400, 'Invalid range or time zone')
  async getUsageHistory(
    @Query() range?: 'current' | 'previous',
    /** IANA time zone for the daily buckets. @example "Asia/Karachi" */
    @Query() tz?: string,
  ): Promise<ApiResponse<UsageHistoryResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Newest-first credit history. `scope=USER` (default) is the caller's own
   * activity and balance; `scope=TEAM` is the whole workspace pool with member
   * names and is owner/admin only. Cursor-paginated. Always registered.
   */
  @Get('credits/ledger')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Credit history fetched')
  @Response<ApiErrorResponse>(403, 'Workspace history is owner/admin only')
  @Response<ApiErrorResponse>(404, 'No active workspace')
  async getCreditLedger(
    @Query() scope?: 'USER' | 'TEAM',
    @Query() limit?: number,
    @Query() cursor?: string,
  ): Promise<ApiResponse<CreditLedgerPageResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * WALLET-only manual renewal ("Pay & Extend for 30 Days") — starts a fresh
   * one-time Safepay checkout the same way `create-checkout` does; the
   * period only actually extends once the webhook confirms payment.
   */
  @Post('subscription/renew')
  @Security('bearerAuth')
  // `?scope=TEAM` renews the workspace for its full current seat count.
  @SuccessResponse(200, 'Renewal checkout session created')
  async renewSubscription(): Promise<ApiResponse<CreateCheckoutResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Turns recurring card billing on/off. For a personal subscription this is
   * CARD only — 400 if it is WALLET (no recurring capability). With
   * `scope: TEAM` it flags the workspace subscription (flag only; team seats
   * are always renewed manually).
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

  /**
   * The workspace's paid transactions, newest first, cursor-paginated. Owner/admin
   * only. Gateway payloads and tokens are never returned. Always registered.
   */
  @Get('team/transactions')
  @Security('bearerAuth')
  @Response<ApiErrorResponse>(403, 'Owner/admin only')
  async listTeamTransactions(
    @Query() limit?: number,
    @Query() cursor?: string,
  ): Promise<ApiResponse<TeamTransactionsPageResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** A receipt for one paid workspace transaction (404 for another workspace's). Owner/admin only. */
  @Get('team/transactions/{id}/receipt')
  @Security('bearerAuth')
  @Response<ApiErrorResponse>(404, 'Receipt not found')
  async getTeamReceipt(
    @Path() id: string,
  ): Promise<ApiResponse<TeamReceiptResponse>> {
    throw new Error('tsoa spec-only')
  }
}
