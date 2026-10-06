import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
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

// ─── Teams models ───────────────────────────────────────────────────────────

export interface CreateTeamRequest {
  /** @example "Alpha Fund" */
  name: string
  /**
   * Seats to buy, 2–150 (Rs 7,499/seat/month).
   * @isInt
   * @minimum 2
   * @maximum 150
   */
  seatCount: number
}

/** Payment Mode returns a checkout to redirect to; Bypass Mode creates the team at once. */
export interface PaidActionResponse {
  checkoutUrl?: string
  trackerId?: string
  teamId?: string
}

export interface AddSeatsRequest {
  /**
   * Extra seats to add (capacity may not exceed 150).
   * @isInt
   * @minimum 1
   * @maximum 150
   */
  seatCount: number
}

export interface SeatUtilization {
  capacity: number
  /** Seat count the next renewal bills (a scheduled reduction); null when none. Invites are limited to it already. */
  scheduledCapacity: number | null
  active: number
  pendingInvites: number
  available: number
}

/** How people on a verified company domain can get into the workspace. */
export type TeamJoinPolicyValue =
  'INVITE_ONLY' | 'REQUEST_APPROVAL' | 'AUTO_APPROVE'

/** Which sign-in methods are accepted for people on a verified domain. */
export type DomainAuthPolicyValue =
  'ANY' | 'GOOGLE_ONLY' | 'GOOGLE_WORKSPACE' | 'SAML_SSO'

export interface SetAuthPolicyRequest {
  authPolicy: DomainAuthPolicyValue
  /** Required when moving to a stricter policy: the domain, typed back as confirmation. @example "fund.com" */
  confirmDomain?: string
}

export interface SetAuthPolicyResponse extends TeamDomainSummary {
  /** Sessions on the domain signed out because they no longer satisfy the policy. */
  revokedSessions: number
}

export interface SsoConfigResponse {
  /** @example "fund.com" */
  domain: string
  authPolicy: DomainAuthPolicyValue
  /** True once SSO has passed a test sign-in and been switched on for the domain. */
  enabled: boolean
  configured: boolean
  /** Give this to the IdP as the SP Entity ID / Audience. */
  spEntityId: string
  /** Give this to the IdP as the ACS (Assertion Consumer Service) URL. */
  acsUrl: string
  idpEntityId: string | null
  idpSsoUrl: string | null
  /** When the IdP's latest signing certificate expires, so admins can plan a rotation. */
  certificateExpiresAt: string | null
  /** Set by a passing test sign-in; cleared whenever the IdP settings change. */
  testedAt: string | null
  lastLoginAt: string | null
}

export interface SsoMetadataXmlRequest {
  source: 'METADATA_XML'
  /** The IdP's SAML metadata document (max 256 KB). */
  metadataXml: string
}

export interface SsoMetadataUrlRequest {
  source: 'METADATA_URL'
  /** Public https URL of the IdP's metadata; fetched once, not stored as a live link. @example "https://idp.example.com/metadata" */
  metadataUrl: string
}

export interface SsoManualRequest {
  source: 'MANUAL'
  idpEntityId: string
  /** HTTP-Redirect sign-in URL; https only. */
  idpSsoUrl: string
  /** PEM or base64 X.509 signing certificate(s). */
  idpCertificate: string
}

export type SsoConfigRequest =
  SsoMetadataXmlRequest | SsoMetadataUrlRequest | SsoManualRequest

export interface SetSsoEnabledRequest {
  enabled: boolean
}

export interface DeleteSsoResponse {
  /** SSO sessions signed out because the connection is gone. */
  revokedSessions: number
}

export interface StartSsoTestResponse {
  /** Send the browser here; the IdP returns to the workspace security page with `sso_test=passed|failed`. */
  redirectUrl: string
}

export interface JoinOptionResponse {
  teamId: string
  teamName: string
  /** @example "fund.com" */
  domain: string
  joinPolicy: Exclude<TeamJoinPolicyValue, 'INVITE_ONLY'>
}

export interface MyJoinRequestResponse {
  id: string
  teamId: string
  teamName: string
  status: 'PENDING'
  createdAt: string
}

export interface JoinRequestSummary {
  id: string
  userId: string
  displayName: string
  email: string
  status: 'PENDING'
  createdAt: string
}

export interface RequestToJoinBody {
  teamId: string
}

export interface RequestToJoinResponse {
  teamId: string
  /** APPROVED means the policy is AUTO_APPROVE and the caller joined immediately. */
  status: 'PENDING' | 'APPROVED'
}

export interface SetJoinPolicyRequest {
  joinPolicy: TeamJoinPolicyValue
}

export interface TeamDomainSummary {
  id: string
  domain: string
  isVerified: boolean
  restrictOrgCreation: boolean
  joinPolicy: TeamJoinPolicyValue
  authPolicy: DomainAuthPolicyValue
}

export interface TeamResponse {
  id: string
  name: string
  status: 'ACTIVE' | 'CANCELLED'
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  seats: SeatUtilization
  creditBalanceInPaisa: number
  orgInstructions: string | null
  /** Owners/admins only; null otherwise or when unset (receipts then go to the owner). */
  billingEmail: string | null
  domains: TeamDomainSummary[]
}

export interface CreateInviteRequest {
  /** @example "analyst@fund.com" */
  email: string
  /** Only the owner may invite an ADMIN. @example "MEMBER" */
  role?: 'ADMIN' | 'MEMBER'
}

export interface CreateInviteResponse {
  invite: { id: string; email: string; role: string; expiresAt: string }
  /** Shown once — only a hash of the token is stored. */
  inviteLink: string
  /** False when the email could not be queued (the link above still works). */
  emailQueued: boolean
}

export interface TeamMemberResponse {
  userId: string
  displayName: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  joinedAt: string
  /** Owners/admins only. */
  email?: string
  /** Owners/admins only; null = no cap. */
  monthlyCreditLimitPaisa?: number | null
}

export interface AcceptInviteRequest {
  token: string
}

export interface AddDomainRequest {
  /** @example "fund.com" */
  domain: string
  /** Default true. */
  restrictOrgCreation?: boolean
}

export interface VerifyDomainRequest {
  domain: string
}

export interface DomainVerificationResponse {
  id: string
  domain: string
  isVerified: boolean
  restrictOrgCreation: boolean
  verification: {
    recordType: 'TXT'
    /** @example "_stockpros-verify.fund.com" */
    recordName: string
    recordValue: string
  }
}

export interface UpdateInstructionsRequest {
  /** Appended as `orgContext` to AI forecast/decision responses for team members. Null clears it. */
  orgInstructions: string | null
}

export interface SetCreditLimitRequest {
  /** Monthly cap on a member's draw from the shared credit pool; null removes the cap. */
  monthlyCreditLimitPaisa: number | null
}

/** Omit a field to leave it alone; send `null` to clear it back to the default. */
export interface PreferencesRequest {
  theme?: 'LIGHT' | 'DARK' | 'SYSTEM' | null
  chartLayout?: 'SINGLE' | 'SPLIT' | 'GRID' | null
  indicators?: string[] | null
}

export interface StoredPreferences {
  theme?: 'LIGHT' | 'DARK' | 'SYSTEM'
  chartLayout?: 'SINGLE' | 'SPLIT' | 'GRID'
  indicators?: string[]
}

export interface PreferencesResponse {
  workspace: StoredPreferences
  personal: StoredPreferences
  /** Workspace defaults overlaid by the caller's own preferences. */
  effective: StoredPreferences
}

export interface SharedWatchlistRequest {
  name: string
  symbols: string[]
}

export interface SharedScreenerRequest {
  name: string
  criteria: Record<string, unknown>
}

export interface ResearchNoteRequest {
  /** @example "AAPL" */
  symbol: string
  content: string
}

export interface ChangeRoleRequest {
  /** OWNER cannot be set here — use ownership transfer. */
  role: 'ADMIN' | 'MEMBER'
}

export interface TransferOwnershipRequest {
  /** Must be an existing, active member; a pending invite is refused. */
  userId: string
}

export interface RenameTeamRequest {
  /** @example "Alpha Fund" */
  name: string
}

export interface DeleteTeamRequest {
  /** Must equal the workspace name exactly. */
  confirmName: string
}

export interface BillingContactRequest {
  /** Receives renewal reminders and receipts. Null falls back to the owner. */
  billingEmail: string | null
}

export interface ReduceSeatsRequest {
  /**
   * Seat count to bill from the next renewal; below the current capacity and
   * not below members plus pending invites.
   * @isInt
   * @minimum 2
   * @maximum 150
   */
  seatCount: number
}

export interface SeatReductionResponse {
  seatCapacity: number
  scheduledSeatCapacity: number | null
}

export interface PendingInviteResponse {
  id: string
  email: string
  role: 'ADMIN' | 'MEMBER'
  expiresAt: string
  createdAt: string
}

export interface AuditLogEntryResponse {
  id: string
  /** @example "ROLE_CHANGED" */
  action: string
  actorUserId: string | null
  /** Current display name; null for system actions or deleted users. */
  actorName: string | null
  targetUserId: string | null
  targetName: string | null
  /** IDs and enum values only — never names or emails. */
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface AuditLogPageResponse {
  entries: AuditLogEntryResponse[]
  /** Pass back as `cursor` for the next (older) page; null at the end. */
  nextCursor: string | null
}

// ─── Controller (TSOA spec-only — not used at runtime) ─────────────────────

@Route('api/v1/teams')
@Tags('Teams')
@Security('bearerAuth')
export class TeamsSwaggerController extends Controller {
  /**
   * Creates a workspace; the caller becomes OWNER. Payment Mode returns a
   * Safepay checkout (the team exists once the webhook confirms payment);
   * Bypass Mode creates it immediately. Blocked (403) when the caller's email
   * domain is a verified, restricted domain of another workspace.
   */
  @Post()
  @SuccessResponse(201, 'Team request processed')
  @Response<ApiErrorResponse>(403, 'Restricted domain')
  @Response<ApiErrorResponse>(409, 'Already part of a workspace')
  async createTeam(
    @Body() body: CreateTeamRequest,
  ): Promise<ApiResponse<PaidActionResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** Workspace details, seat utilization (e.g. 8/10), domain policies and the caller's role. */
  @Get('me')
  async getMyTeam(): Promise<ApiResponse<TeamResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** Adds seats mid-term (`newSeats × 749,900` paisa); capacity increments when the webhook confirms payment. Owner/admin only. */
  @Post('seats/add')
  async addSeats(
    @Body() body: AddSeatsRequest,
  ): Promise<ApiResponse<PaidActionResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** Workspace members. `email` and `monthlyCreditLimitPaisa` are returned to owners/admins only. */
  @Get('members')
  async listMembers(): Promise<ApiResponse<TeamMemberResponse[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Issues an invite and queues the invite email; enforces
   * `active seats + pending invites < capacity`. The link is also returned
   * (`emailQueued` reports whether the email was queued).
   */
  @Post('invites')
  @SuccessResponse(201, 'Invite created')
  @Response<ApiErrorResponse>(409, 'No seats available')
  async createInvite(
    @Body() body: CreateInviteRequest,
  ): Promise<ApiResponse<CreateInviteResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** Accepts an invite addressed to the caller's email and joins the workspace. */
  @Post('invites/accept')
  async acceptInvite(@Body() body: AcceptInviteRequest): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** Removes a member (hard delete, freeing their seat). Owner/admin only; the owner cannot be removed. */
  @Delete('members/{userId}')
  async removeMember(@Path() userId: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** Sets (or clears) a member's monthly cap on spending from the team credit pool. */
  @Patch('members/{userId}/credit-limit')
  async setMemberCreditLimit(
    @Path() userId: string,
    @Body() body: SetCreditLimitRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** Claims a company domain and attempts DNS TXT verification. Public mailbox providers are rejected. */
  @Post('domains')
  @SuccessResponse(201, 'Domain added')
  async addDomain(
    @Body() body: AddDomainRequest,
  ): Promise<ApiResponse<DomainVerificationResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** Re-checks the DNS TXT record for a previously added domain. */
  @Post('domains/verify')
  async verifyDomain(
    @Body() body: VerifyDomainRequest,
  ): Promise<ApiResponse<DomainVerificationResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Workspaces the caller could ask to join: a verified company domain matching
   * the caller's email, opened up by its admins. Empty when the caller already
   * has a workspace or uses a public mailbox domain.
   */
  @Get('join-options')
  async listJoinOptions(): Promise<ApiResponse<JoinOptionResponse[]>> {
    throw new Error('tsoa spec-only')
  }

  /** The caller's pending join request, or `null`. */
  @Get('join-requests/me')
  async getMyJoinRequest(): Promise<ApiResponse<MyJoinRequestResponse | null>> {
    throw new Error('tsoa spec-only')
  }

  /** Cancels the caller's pending join request. */
  @Delete('join-requests/me')
  @Response<ApiErrorResponse>(404, 'No pending request')
  async cancelMyJoinRequest(): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Asks to join a workspace. AUTO_APPROVE joins immediately (seat capacity
   * permitting); REQUEST_APPROVAL queues a request and emails the admins.
   * Rate limited, and a declined user waits 24 hours before asking again.
   */
  @Post('join-requests')
  @SuccessResponse(201, 'Join request processed')
  @Response<ApiErrorResponse>(404, 'Workspace not open to join requests')
  @Response<ApiErrorResponse>(
    409,
    'Already in a workspace, no free seats or recently declined',
  )
  @Response<ApiErrorResponse>(429, 'Too many requests')
  async requestToJoin(
    @Body() body: RequestToJoinBody,
  ): Promise<ApiResponse<RequestToJoinResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** Pending join requests for the caller's workspace. Owner/admin only. */
  @Get('join-requests')
  async listJoinRequests(): Promise<ApiResponse<JoinRequestSummary[]>> {
    throw new Error('tsoa spec-only')
  }

  /** Approves a pending request and seats the requester as a MEMBER. Owner/admin only. */
  @Post('join-requests/{id}/approve')
  @Response<ApiErrorResponse>(409, 'No free seats or already handled')
  async approveJoinRequest(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** Declines a pending request. Owner/admin only. */
  @Post('join-requests/{id}/decline')
  @Response<ApiErrorResponse>(409, 'Already handled')
  async declineJoinRequest(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** Sets who may join through a verified domain. Owner/admin only; the domain must be verified to leave INVITE_ONLY. */
  @Patch('domains/{domain}/join-policy')
  async setJoinPolicy(
    @Path() domain: string,
    @Body() body: SetJoinPolicyRequest,
  ): Promise<ApiResponse<TeamDomainSummary>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Sets which sign-in methods people on a verified domain may use (owner only).
   * Moving to GOOGLE_ONLY or GOOGLE_WORKSPACE requires `confirmDomain`, requires
   * the owner's own session to already satisfy the policy when the owner's email
   * is on the domain (409 otherwise), and immediately signs out every
   * non-compliant session on the domain except the caller's.
   */
  @Patch('domains/{domain}/auth-policy')
  @Response<ApiErrorResponse>(
    400,
    'Domain not verified or confirmation missing',
  )
  @Response<ApiErrorResponse>(409, 'Owner would be locked out')
  async setAuthPolicy(
    @Path() domain: string,
    @Body() body: SetAuthPolicyRequest,
  ): Promise<ApiResponse<SetAuthPolicyResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** SSO setup for a domain: the values to give the IdP, the stored IdP settings, and test status. Owner/admin only. */
  @Get('domains/{domain}/sso')
  @Response<ApiErrorResponse>(403, 'Not an owner/admin, or SSO is not enabled')
  @Response<ApiErrorResponse>(404, 'Domain not found in your workspace')
  async getSsoConfig(
    @Path() domain: string,
  ): Promise<ApiResponse<SsoConfigResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Saves the IdP's settings from metadata XML, a metadata URL (fetched over
   * https from a public address only) or manual fields. Any change switches SSO
   * off and clears the test result, so it must be re-tested and re-enabled.
   * Refused (409) while the domain requires SSO. Owner/admin only.
   */
  @Put('domains/{domain}/sso')
  @Response<ApiErrorResponse>(
    400,
    'Domain not verified or invalid IdP settings',
  )
  @Response<ApiErrorResponse>(409, 'The domain currently requires SSO')
  async saveSsoConfig(
    @Path() domain: string,
    @Body() body: SsoConfigRequest,
  ): Promise<ApiResponse<SsoConfigResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** Removes the SSO connection and signs out its SSO sessions. Refused (409) while the domain requires SSO. Owner/admin only. */
  @Delete('domains/{domain}/sso')
  @Response<ApiErrorResponse>(404, 'SSO is not configured for this domain')
  @Response<ApiErrorResponse>(409, 'The domain currently requires SSO')
  async deleteSsoConfig(
    @Path() domain: string,
  ): Promise<ApiResponse<DeleteSsoResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Switches SSO sign-in on or off for the domain. **Enabling is owner only**
   * (403 for admins: whoever controls the IdP settings could otherwise assert any
   * email on the domain) and needs a passing test. Disabling is owner/admin,
   * signs out SSO sessions and is refused (409) while the domain requires SSO.
   * Requiring SSO is a separate owner-only step
   * (`PATCH domains/{domain}/auth-policy` with `SAML_SSO`).
   */
  @Patch('domains/{domain}/sso/enabled')
  @Response<ApiErrorResponse>(400, 'Not configured, or not tested yet')
  @Response<ApiErrorResponse>(409, 'The domain currently requires SSO')
  async setSsoEnabled(
    @Path() domain: string,
    @Body() body: SetSsoEnabledRequest,
  ): Promise<ApiResponse<SsoConfigResponse>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Starts a "Test SSO connection" sign-in. A passing test marks the
   * connection tested and, if the same admin signs in, upgrades their own
   * session to an SSO session. Owner/admin only.
   */
  @Post('domains/{domain}/sso/test')
  @Response<ApiErrorResponse>(400, 'SSO is not configured yet')
  async testSsoConnection(
    @Path() domain: string,
  ): Promise<ApiResponse<StartSsoTestResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** Updates workspace-wide AI instructions (returned as `orgContext` on forecasts/decisions). Owner/admin only. */
  @Patch('instructions')
  async updateInstructions(
    @Body() body: UpdateInstructionsRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** Effective preferences: workspace defaults overlaid by the caller's own. */
  @Get('preferences')
  async getPreferences(): Promise<ApiResponse<PreferencesResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** Updates the caller's personal preferences. */
  @Patch('preferences')
  async updateMyPreferences(
    @Body() body: PreferencesRequest,
  ): Promise<ApiResponse<PreferencesResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** Updates workspace default preferences. Owner/admin only. */
  @Patch('preferences/workspace')
  async updateWorkspacePreferences(
    @Body() body: PreferencesRequest,
  ): Promise<ApiResponse<PreferencesResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** Aggregate and per-member signal, forecast and search usage, credit spend and active tickers. Owner/admin only. */
  @Get('analytics')
  async getAnalytics(): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** Workspace search across shared watchlists, screeners, research notes and members' saved AI decisions. */
  @Get('search')
  async search(@Query() q: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  @Get('watchlists')
  async listWatchlists(): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  @Post('watchlists')
  @SuccessResponse(201, 'Shared watchlist created')
  async createWatchlist(
    @Body() body: SharedWatchlistRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  @Delete('watchlists/{id}')
  async deleteWatchlist(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  @Get('screeners')
  async listScreeners(): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  @Post('screeners')
  @SuccessResponse(201, 'Shared screener created')
  async createScreener(
    @Body() body: SharedScreenerRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  @Delete('screeners/{id}')
  async deleteScreener(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  @Get('notes')
  async listNotes(@Query() symbol?: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  @Post('notes')
  @SuccessResponse(201, 'Research note created')
  async createNote(@Body() body: ResearchNoteRequest): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  @Delete('notes/{id}')
  async deleteNote(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** Promotes or demotes a member (ADMIN ↔ MEMBER). Owner only; the owner role is never set here. Recorded in the audit log. */
  @Patch('members/{userId}/role')
  @Response<ApiErrorResponse>(
    403,
    'Owner only / cannot change own or the owner role',
  )
  async changeMemberRole(
    @Path() userId: string,
    @Body() body: ChangeRoleRequest,
  ): Promise<ApiResponse<{ userId: string; role: string }>> {
    throw new Error('tsoa spec-only')
  }

  /** Hands the workspace to an existing active member; the previous owner becomes an admin. Owner only. */
  @Post('ownership/transfer')
  @Response<ApiErrorResponse>(
    404,
    'Target is not a member of this workspace (e.g. a pending invite)',
  )
  async transferOwnership(
    @Body() body: TransferOwnershipRequest,
  ): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** Leaves the workspace (seat freed, plan falls back). The owner must transfer ownership first (403). */
  @Post('leave')
  async leaveTeam(): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** Unexpired pending invites. Owner/admin only. */
  @Get('invites')
  async listInvites(): Promise<ApiResponse<PendingInviteResponse[]>> {
    throw new Error('tsoa spec-only')
  }

  /** Revokes a pending invite, freeing its reserved seat. Admin invites need the owner. */
  @Delete('invites/{id}')
  async revokeInvite(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /** Issues a fresh link and expiry for a pending invite (the old link stops working) and re-queues the email. */
  @Post('invites/{id}/resend')
  async resendInvite(
    @Path() id: string,
  ): Promise<ApiResponse<CreateInviteResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** Renames the workspace. Owner/admin only. */
  @Patch()
  async renameTeam(
    @Body() body: RenameTeamRequest,
  ): Promise<ApiResponse<{ id: string; name: string }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Deletes the workspace. Owner only, with the exact name as confirmation.
   * Cancels it, turns auto-renew off, purges shared assets, invites and
   * domains, hard-deletes every seat (members fall back to their personal plan
   * and may join another workspace) and forfeits any remaining credit. Payment
   * history, the credit ledger and the audit log are kept (no personal data).
   */
  @Delete()
  @Response<ApiErrorResponse>(400, 'Confirmation name does not match')
  async deleteTeam(@Body() body: DeleteTeamRequest): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Owner-only JSON download of the workspace: settings, members (with emails),
   * domains, shared assets, paid transactions (no gateway payloads) and the
   * audit log, each capped at 5,000 rows. Served as an attachment, not the
   * usual envelope. Recorded in the audit log.
   */
  @Get('export')
  async exportTeam(): Promise<Record<string, unknown>> {
    throw new Error('tsoa spec-only')
  }

  /** Sets or clears the billing contact. Owner/admin only. */
  @Patch('billing-contact')
  async updateBillingContact(
    @Body() body: BillingContactRequest,
  ): Promise<ApiResponse<{ billingEmail: string | null }>> {
    throw new Error('tsoa spec-only')
  }

  /** Schedules a smaller seat count for the next renewal (no mid-term refund); invites are limited to it immediately. */
  @Post('seats/reduce')
  @Response<ApiErrorResponse>(409, 'Below the seats currently in use')
  async scheduleSeatReduction(
    @Body() body: ReduceSeatsRequest,
  ): Promise<ApiResponse<SeatReductionResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** Cancels a scheduled seat reduction. */
  @Delete('seats/reduce')
  async cancelSeatReduction(): Promise<ApiResponse<SeatReductionResponse>> {
    throw new Error('tsoa spec-only')
  }

  /** Newest-first, cursor-paginated admin activity (invites, role changes, removals, settings, billing). Owner/admin only. */
  @Get('audit-log')
  async listAuditLog(
    @Query() limit?: number,
    @Query() cursor?: string,
    @Query() action?: string,
  ): Promise<ApiResponse<AuditLogPageResponse>> {
    throw new Error('tsoa spec-only')
  }
}
