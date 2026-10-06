import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Query,
  Response,
  Route,
  Security,
  Tags,
} from 'tsoa'

import { ApiErrorResponse, ApiResponse } from '../../shared/docs-types'

// ─── Internal staff ops panel models ────────────────────────────────────────
// Every route below exists ONLY in the tier-based workflow
// (`pricingTiersEnabled: true`); otherwise it answers
// `403 FORBIDDEN_FEATURE_DISABLED`. Every write requires a `reason` and appends
// one immutable `admin_audit_logs` row. Searches that return customer data
// (users, teams, webhooks, credit ledger) append a `CUSTOMER_DATA_VIEWED` row listing
// the ids returned, never the search text.

export interface AdminReasonRequest {
  /**
   * Justification stored on the audit row.
   * @minLength 10
   * @maxLength 500
   * @example "Customer escalation #4821, approved by finance"
   */
  reason: string
  /**
   * Support ticket this action answers (uppercase key, dash, number). Optional
   * unless `config.admin.requireTicketRef` is on (production); the format is
   * validated whenever it is supplied. A blank string counts as absent.
   * @pattern ^[A-Z][A-Z0-9]{1,9}-\d{1,8}$
   * @example "SUP-1234"
   */
  ticketRef?: string
}

export interface StepUpVerifyRequest {
  /** @pattern ^\d{6}$ */
  code: string
}

export interface PlanOverrideRequest extends AdminReasonRequest {
  /** @example "PRO" */
  plan: 'FREE' | 'PRO' | 'TEAM'
}

export interface SeatCapacityRequest extends AdminReasonRequest {
  /**
   * New seat ceiling for an enterprise deal (2–10000). Also clears any
   * scheduled seat reduction.
   * @isInt
   * @minimum 2
   * @maximum 10000
   */
  seatCapacity: number
}

export interface CreditAdjustmentRequest extends AdminReasonRequest {
  /** Whose pool to adjust. */
  target: 'USER' | 'TEAM'
  /** @format uuid */
  targetId: string
  /**
   * Signed whole paisa: positive injects, negative deducts (never below zero).
   * @isInt
   * @example 500000
   */
  amountPaisa: number
}

export interface ExtendSubscriptionRequest extends AdminReasonRequest {
  /** @format date-time */
  currentPeriodEnd?: string
  /** @format date-time */
  gracePeriodEnd?: string
}

export interface MarketEmergencyRequest extends AdminReasonRequest {
  /** true halts the market (in-memory, this process only). */
  closed: boolean
}

@Route('api/v1/admin')
@Tags('Admin')
@Security('bearerAuth')
@Response<ApiErrorResponse>(
  401,
  'Staff session older than the configured maximum (STAFF_SESSION_EXPIRED): the session is revoked and the staff member must sign in again',
)
@Response<ApiErrorResponse>(
  429,
  'Rate limited: 120 requests/min per IP, 20 writes/min per staff member',
)
@Response<ApiErrorResponse>(
  403,
  'Tier workflow disabled (FORBIDDEN_FEATURE_DISABLED), insufficient platform role, step-up verification needed on a write (STEP_UP_REQUIRED), or a network outside config.admin.ipAllowlist (ADMIN_IP_NOT_ALLOWED)',
)
export class AdminSwaggerController extends Controller {
  /** SUPPORT_AGENT+. Emails a one-time 6-digit code to the signed-in staff member. Sensitive writes then succeed for `stepUpWindowMinutes` (the window slides with each successful write). 60-second resend cooldown; 503 if the email could not be queued. */
  @Post('step-up/request')
  async requestStepUp(): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** SUPPORT_AGENT+. Checks the emailed code (5 attempts, 5-minute expiry) and starts the verification window. Writes made without a valid window answer `403 STEP_UP_REQUIRED`. */
  @Post('step-up/verify')
  @Response<ApiErrorResponse>(401, 'Wrong, expired or missing code')
  async verifyStepUp(@Body() body: StepUpVerifyRequest): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** SUPPORT_AGENT+. Global search by email, id or name: plan, credit balance, active sessions, subscription. */
  @Get('users/search')
  async searchUsers(
    @Query() q: string,
    @Query() limit?: number,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** SUPER_ADMIN. Overrides a plan (bypasses Safepay). Downgrading TEAM removes non-owner members; owners get 409. */
  @Post('users/{id}/plan-override')
  @Response<ApiErrorResponse>(409, 'User owns a workspace')
  async overridePlan(
    @Path() id: string,
    @Body() body: PlanOverrideRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** SUPER_ADMIN. Force-revokes all active sessions. */
  @Post('users/{id}/sessions/invalidate')
  async invalidateSessions(
    @Path() id: string,
    @Body() body: AdminReasonRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** SUPPORT_AGENT+. Newest-first history of one customer from transactional records only: payments, credit movements, sign-ins, workspace changes and staff actions. No usage analytics (PostHog), IPs or raw payloads. Page backwards with `before` (the previous page's `nextBefore`). Read-audited. */
  @Get('users/{id}/timeline')
  async getUserTimeline(
    @Path() id: string,
    @Query() limit?: number,
    @Query() before?: string,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** SUPPORT_AGENT+. Returns a customer's real email, name and phone number. Search results mask these by default (`piiMasked: true`); every reveal is audited as CUSTOMER_DATA_REVEALED with the reason and ticket. */
  @Post('users/{id}/reveal')
  async revealUser(
    @Path() id: string,
    @Body() body: AdminReasonRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** SUPPORT_AGENT+. Searches workspaces: seat utilization (e.g. 8/10), owner, members, orgInstructions. */
  @Get('teams/search')
  async searchTeams(
    @Query() q: string,
    @Query() limit?: number,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** PLATFORM_ADMIN+. Overrides seat capacity beyond the 150-seat self-serve cap and clears scheduledSeatCapacity. */
  @Patch('teams/{id}/capacity')
  async setSeatCapacity(
    @Path() id: string,
    @Body() body: SeatCapacityRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** PLATFORM_ADMIN+. Force-verifies a TeamDomain, bypassing DNS TXT. */
  @Post('teams/domains/{id}/verify')
  async forceVerifyDomain(
    @Path() id: string,
    @Body() body: AdminReasonRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * SUPPORT_AGENT+. A domain's SSO setup for diagnosis: whether it is
   * configured, tested and enabled, the IdP's entity id and sign-in URL, when
   * its certificate expires, how many SSO sessions are live, and the recent
   * SSO configuration trail (`SAML_CONFIG_UPDATED`, `SAML_ENABLED`,
   * `SAML_DISABLED`). Certificates are never returned. Audited as a read.
   */
  @Get('teams/domains/{domain}/sso')
  @Response<ApiErrorResponse>(404, 'Domain not found')
  async getTeamSso(@Path() domain: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * PLATFORM_ADMIN+. Emergency off-switch for a broken IdP: turns SSO off,
   * signs out its SSO sessions and, when the domain required SSO, puts it back
   * to accepting any sign-in method. Audit-logged (`SAML_DISABLED`) and
   * alerted; 409 when SSO is already off.
   */
  @Post('teams/domains/{domain}/sso/disable')
  @Response<ApiErrorResponse>(409, 'SSO is already disabled for this domain')
  async disableTeamSso(
    @Path() domain: string,
    @Body() body: AdminReasonRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * PLATFORM_ADMIN+. Removes the domain's SSO connection entirely so the
   * customer can configure it again; also signs out its SSO sessions and, when
   * SSO was required, returns the domain to any sign-in method. Audit-logged
   * (`SAML_CONFIG_RESET`) and alerted; 409 when SSO is not configured.
   */
  @Post('teams/domains/{domain}/sso/reset')
  @Response<ApiErrorResponse>(409, 'SSO is not configured for this domain')
  async resetTeamSso(
    @Path() domain: string,
    @Body() body: AdminReasonRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * PLATFORM_ADMIN+. Emergency reset: puts a domain's sign-in policy back to
   * `ANY` (for an owner who locked their organization out). Audit-logged and
   * alerted; 409 when the domain already accepts any method.
   */
  @Post('teams/domains/{domain}/reset-auth-policy')
  async resetAuthPolicy(
    @Path() domain: string,
    @Body() body: AdminReasonRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** PLATFORM_ADMIN+. Hard-removes a member, freeing the seat instantly. The owner cannot be removed (409). */
  @Delete('teams/members/{userId}')
  async forceRemoveMember(
    @Path() userId: string,
    @Body() body: AdminReasonRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** SUPPORT_AGENT+. Safepay webhook diagnostics from PaymentTransaction (stored payloads are signature-verified). */
  @Get('billing/webhooks')
  async listWebhooks(
    @Query() page?: number,
    @Query() limit?: number,
    @Query() status?: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
    @Query() trackerId?: string,
    @Query() from?: string,
    @Query() to?: string,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** PLATFORM_ADMIN+. Idempotently replays the stored webhook payload. */
  @Post('billing/webhooks/{id}/retry')
  @Response<ApiErrorResponse>(409, 'No stored webhook payload')
  async retryWebhook(
    @Path() id: string,
    @Body() body: AdminReasonRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** SUPPORT_AGENT+. Credit-pool movements (top-ups, overage deductions, refunds, manual adjustments) filtered by user, team or type. Transactional billing record only; product-usage analytics live in PostHog. Read-audited. */
  @Get('billing/credit-ledger')
  async listCreditLedger(
    @Query() page?: number,
    @Query() limit?: number,
    @Query() userId?: string,
    @Query() teamId?: string,
    @Query()
    type?: 'PURCHASE' | 'OVERAGE_CONSUMPTION' | 'REFUND' | 'MANUAL_ADJUSTMENT',
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** PLATFORM_ADMIN+. Injects/deducts paisa and appends a MANUAL_ADJUSTMENT ledger row. */
  @Post('billing/credits/adjust')
  @Response<ApiErrorResponse>(400, 'Deduction exceeds balance')
  async adjustCredits(
    @Body() body: CreditAdjustmentRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** PLATFORM_ADMIN+. Adjusts currentPeriodEnd and/or gracePeriodEnd. */
  @Post('subscriptions/{id}/extend')
  @Response<ApiErrorResponse>(409, 'Subscription is cancelled or expired')
  async extendSubscription(
    @Path() id: string,
    @Body() body: ExtendSubscriptionRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** SUPPORT_AGENT+. Job counts, recent failures and retry attempts for the email and subscription cron queues. */
  @Get('telemetry/queues')
  async getQueueHealth(): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** SUPPORT_AGENT+. Current in-memory emergency-close state. */
  @Get('system/market-status')
  async getMarketStatus(): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** SUPER_ADMIN. Toggles the emergency market halt in memory (no restart; this process only). */
  @Post('system/market-emergency')
  async setMarketEmergency(
    @Body() body: MarketEmergencyRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** SUPPORT_AGENT+. Paginated search across all staff actions. */
  @Get('system/audit-logs')
  async listAuditLogs(
    @Query() page?: number,
    @Query() limit?: number,
    @Query() adminId?: string,
    @Query() action?: string,
    @Query() targetType?: string,
    @Query() targetId?: string,
    @Query() ticketRef?: string,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }
}
