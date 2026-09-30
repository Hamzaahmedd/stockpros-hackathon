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
  active: number
  pendingInvites: number
  available: number
}

export interface TeamDomainSummary {
  id: string
  domain: string
  isVerified: boolean
  restrictOrgCreation: boolean
}

export interface TeamResponse {
  id: string
  name: string
  status: 'ACTIVE' | 'CANCELLED'
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  seats: SeatUtilization
  creditBalanceInPaisa: number
  orgInstructions: string | null
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
}
