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

export interface SpendLimitRequest {
  /**
   * The customer's new monthly credit-spend limit in whole paisa, or null to
   * remove it. One signal (the minimum) up to Rs 100,000.
   * @isInt
   * @example 500000
   */
  monthlyLimitPaisa: number | null
  /**
   * Justification stored on the audit row.
   * @minLength 10
   * @maxLength 500
   */
  reason: string
  /**
   * Support ticket this change answers. Always required here, because the
   * customer is emailed the reference.
   * @pattern ^[A-Z][A-Z0-9]{1,9}-\d{1,8}$
   * @example "SUP-1234"
   */
  ticketRef: string
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

  /** SUPPORT_AGENT+. Global search by email, id or name: plan, credit balance, personal spend limit (`monthlyCreditLimitPaisa`, null = none), `usageAlertsEnabled`, active sessions, subscription. */
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

  /** PLATFORM_ADMIN. Sets or removes (null) an individual Pro user's own monthly credit-spend limit on their behalf. Needs a reason and a ticketRef, step-up verification, and appends one `SPEND_LIMIT_OVERRIDDEN` audit row (previous and new limit) in the same transaction. After it commits the customer is emailed the previous limit, the new limit and the ticketRef (best effort: a mail problem never fails or rolls back the change). 409 for FREE users, workspace members (their cap belongs to a workspace admin) and a no-op change. */
  @Post('users/{id}/spend-limit')
  @Response<ApiErrorResponse>(
    409,
    'FREE user, workspace member, or limit unchanged',
  )
  async overrideSpendLimit(
    @Path() id: string,
    @Body() body: SpendLimitRequest,
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

  /** SUPPORT_AGENT+. A customer's metering position: plan allowance used/remaining, personal or workspace spend cap with this cycle's spend, credit pool balance, whether usage-warning emails are on, and `blockedReason` (INSUFFICIENT_CREDITS, SPEND_LIMIT_REACHED or PERSONAL_SPEND_LIMIT_REACHED) when the next metered AI action would be refused, null otherwise. Uses the same window and counting rules as enforcement. Read-audited. */
  @Get('users/{id}/usage')
  async getUserUsage(@Path() id: string): Promise<ApiResponse> {
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

  /** SUPPORT_AGENT+. Searches workspaces: seat utilization (e.g. 8/10), owner, members (each with their credit cap `monthlyCreditLimitPaisa` and `cycleSpendPaisa` for the current billing cycle), orgInstructions. */
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

// ─── Announcements (staff) ──────────────────────────────────────────────────
// Every route below also answers `403 FORBIDDEN_FEATURE_DISABLED` while
// `features.enableAnnouncements` is off. Every write needs step-up verification,
// a `reason`, and appends one audit row in the same transaction. A staff write
// refreshes the shared cache and tells connected clients to refetch.

type AnnouncementPlacementName =
  'MODAL' | 'SPOTLIGHT' | 'BANNER' | 'BADGE' | 'CHANGELOG'
type AnnouncementStatusName = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
type AnnouncementPlanName = 'ALL' | 'FREE' | 'PRO' | 'TEAM'
type AnnouncementRoleName = 'OWNER' | 'ADMIN' | 'MEMBER'

export interface AnnouncementContentFields {
  /** @maxLength 120 */
  title: string
  /**
   * Plain text, shown as text (never HTML).
   * @maxLength 1000
   */
  body: string
  /** Required together with `ctaUrl`. @maxLength 40 */
  ctaLabel?: string | null
  /** An in-app path ("/plans") or an https URL without credentials. */
  ctaUrl?: string | null
  /** https only. */
  imageUrl?: string | null
  placement: AnnouncementPlacementName
  /** Required for a BANNER, forbidden otherwise. */
  severity?: 'INFO' | 'WARNING' | 'CRITICAL' | null
  /** Required for a SPOTLIGHT, forbidden otherwise. A fixed UI hook, never a selector. */
  anchor?:
    | 'NOTIFICATION_BELL'
    | 'SIDEBAR_WORKSPACE'
    | 'WATCHLIST_ADD'
    | 'FORECAST_PANEL'
    | 'PLANS_UPGRADE'
    | 'SETTINGS_PREFERENCES'
    | null
  /** Required for a BADGE, forbidden otherwise. */
  navKey?:
    | 'DASHBOARD'
    | 'WATCHLIST'
    | 'MARKET'
    | 'FORECAST'
    | 'NEWS'
    | 'PLANS'
    | 'WORKSPACE'
    | 'SETTINGS'
    | null
  /**
   * Higher wins when several compete for one placement.
   * @minimum -100
   * @maximum 100
   * @default 0
   */
  priority?: number
  /** @default true */
  dismissible?: boolean
  /** Also list in the notification-bell changelog. Always true for a CHANGELOG placement. @default true */
  inChangelog?: boolean
  /** `ALL` (the default) absorbs any other entry. */
  targetPlans?: AnnouncementPlanName[]
  /** Workspace roles; empty (the default) targets every role. Solo accounts count as OWNER. */
  targetRoles?: AnnouncementRoleName[]
  /**
   * ISO 8601 with offset; evaluated in UTC at request time.
   * @format date-time
   */
  startsAt?: string | null
  /**
   * Must be after `startsAt`.
   * @format date-time
   */
  endsAt?: string | null
}

export interface CreateAnnouncementRequest
  extends AnnouncementContentFields, AdminReasonRequest {}

export interface UpdateAnnouncementRequest
  extends Partial<AnnouncementContentFields>, AdminReasonRequest {
  /**
   * The `version` the editor last saw; a mismatch answers 409.
   * @minimum 1
   */
  expectedVersion: number
}

export interface AdminAnnouncement {
  id: string
  title: string
  body: string
  ctaLabel: string | null
  ctaUrl: string | null
  imageUrl: string | null
  placement: AnnouncementPlacementName
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | null
  anchor: string | null
  navKey: string | null
  priority: number
  dismissible: boolean
  inChangelog: boolean
  targetPlans: AnnouncementPlanName[]
  targetRoles: AnnouncementRoleName[]
  startsAt: string | null
  endsAt: string | null
  publishedAt: string | null
  status: AnnouncementStatusName
  /** The kill switch: false hides it everywhere without changing its status. */
  isEnabled: boolean
  /** Bumped on every write. */
  version: number
  /** Bumped by "re-announce"; dismissals from older epochs no longer count. */
  reannounceEpoch: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface AdminAnnouncementDetail extends AdminAnnouncement {
  /** Users who have seen / dismissed it in the current epoch. */
  engagement: { seen: number; dismissed: number }
}

export interface AdminAnnouncementList {
  items: AdminAnnouncement[]
  total: number
  page: number
  limit: number
}

export interface AdminAnnouncementSwitchResult extends AdminAnnouncement {
  /** False when it was already in the requested state (nothing written, nothing audited). */
  changed: boolean
}

@Route('api/v1/admin/announcements')
@Tags('Admin')
@Security('bearerAuth')
@Response<ApiErrorResponse>(403, 'Insufficient role, or the feature is off')
export class AdminAnnouncementsSwaggerController extends Controller {
  /**
   * SUPPORT_AGENT. Lists announcements, newest first.
   * @param status Filter by lifecycle status
   * @param placement Filter by placement
   * @param page 1-based page
   * @param limit Page size (1-100, default 25)
   */
  @Get('')
  async listAnnouncements(
    @Query() status?: AnnouncementStatusName,
    @Query() placement?: AnnouncementPlacementName,
    @Query() page?: number,
    @Query() limit?: number,
  ): Promise<ApiResponse<AdminAnnouncementList>> {
    throw new Error('tsoa spec-only')
  }

  /** SUPPORT_AGENT. One announcement with how many users have seen and dismissed it. */
  @Get('{id}')
  @Response<ApiErrorResponse>(404, 'Not found')
  async getAnnouncement(
    @Path() id: string,
  ): Promise<ApiResponse<AdminAnnouncementDetail>> {
    throw new Error('tsoa spec-only')
  }

  /** PLATFORM_ADMIN. Creates a DRAFT. Drafts are never shown to users. */
  @Post('')
  @Response<ApiErrorResponse>(400, 'Invalid content')
  async createAnnouncement(
    @Body() body: CreateAnnouncementRequest,
  ): Promise<ApiResponse<AdminAnnouncement>> {
    throw new Error('tsoa spec-only')
  }

  /** PLATFORM_ADMIN. Edits any subset of the content. Permanent dismissals are kept (use re-announce to reset them). 409 for a stale `expectedVersion`, an archived announcement or no change. */
  @Patch('{id}')
  @Response<ApiErrorResponse>(400, 'Invalid content')
  @Response<ApiErrorResponse>(404, 'Not found')
  @Response<ApiErrorResponse>(409, 'Stale version, archived, or no change')
  async updateAnnouncement(
    @Path() id: string,
    @Body() body: UpdateAnnouncementRequest,
  ): Promise<ApiResponse<AdminAnnouncement>> {
    throw new Error('tsoa spec-only')
  }

  /** PLATFORM_ADMIN. Archives (soft delete); it is never served again. */
  @Delete('{id}')
  @Response<ApiErrorResponse>(404, 'Not found')
  @Response<ApiErrorResponse>(409, 'Already archived')
  async archiveAnnouncement(
    @Path() id: string,
    @Body() body: AdminReasonRequest,
  ): Promise<ApiResponse<AdminAnnouncement>> {
    throw new Error('tsoa spec-only')
  }

  /** PLATFORM_ADMIN. Publishes a DRAFT (stamps `publishedAt`). 409 unless it is a draft whose window has not ended. */
  @Post('{id}/publish')
  @Response<ApiErrorResponse>(404, 'Not found')
  @Response<ApiErrorResponse>(409, 'Not a draft, or its window has ended')
  async publishAnnouncement(
    @Path() id: string,
    @Body() body: AdminReasonRequest,
  ): Promise<ApiResponse<AdminAnnouncement>> {
    throw new Error('tsoa spec-only')
  }

  /** SUPPORT_AGENT. Emergency kill switch: hides the announcement everywhere (cache refreshed, clients told to refetch). Already off is a no-op (`changed: false`). */
  @Post('{id}/disable')
  @Response<ApiErrorResponse>(404, 'Not found')
  @Response<ApiErrorResponse>(409, 'Archived')
  async disableAnnouncement(
    @Path() id: string,
    @Body() body: AdminReasonRequest,
  ): Promise<ApiResponse<AdminAnnouncementSwitchResult>> {
    throw new Error('tsoa spec-only')
  }

  /** PLATFORM_ADMIN. Switches a disabled announcement back on. */
  @Post('{id}/enable')
  @Response<ApiErrorResponse>(404, 'Not found')
  @Response<ApiErrorResponse>(409, 'Archived')
  async enableAnnouncement(
    @Path() id: string,
    @Body() body: AdminReasonRequest,
  ): Promise<ApiResponse<AdminAnnouncementSwitchResult>> {
    throw new Error('tsoa spec-only')
  }

  /** PLATFORM_ADMIN. Starts a new epoch so every user's earlier dismissal and read state stops counting and they see it again. 409 unless published. */
  @Post('{id}/reannounce')
  @Response<ApiErrorResponse>(404, 'Not found')
  @Response<ApiErrorResponse>(409, 'Not published')
  async reannounceAnnouncement(
    @Path() id: string,
    @Body() body: AdminReasonRequest,
  ): Promise<ApiResponse<AdminAnnouncement>> {
    throw new Error('tsoa spec-only')
  }
}
