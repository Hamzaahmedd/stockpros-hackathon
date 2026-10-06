import {
  Controller,
  Get,
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

// ─── Models ───────────────────────────────────────────────────────────────────

export interface AnnouncementItem {
  /** @example "018f2e1a-9c3d-7b2a-9f1e-2a3b4c5d6e7f" */
  id: string
  title: string
  /** Plain text. Clients must render it as text, never as HTML. */
  body: string
  ctaLabel: string | null
  /** A relative app path or an https URL. */
  ctaUrl: string | null
  imageUrl: string | null
  /** @example "MODAL" */
  placement: 'MODAL' | 'SPOTLIGHT' | 'BANNER' | 'BADGE' | 'CHANGELOG'
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | null
  /** Fixed UI anchor a SPOTLIGHT points at. */
  anchor:
    | 'NOTIFICATION_BELL'
    | 'SIDEBAR_WORKSPACE'
    | 'WATCHLIST_ADD'
    | 'FORECAST_PANEL'
    | 'PLANS_UPGRADE'
    | 'SETTINGS_PREFERENCES'
    | null
  /** Sidebar entry a BADGE decorates. */
  navKey:
    | 'DASHBOARD'
    | 'WATCHLIST'
    | 'MARKET'
    | 'FORECAST'
    | 'NEWS'
    | 'PLANS'
    | 'WORKSPACE'
    | 'SETTINGS'
    | null
  priority: number
  dismissible: boolean
  /** @format date-time */
  publishedAt: string
  /** True until the caller has seen or dismissed it. */
  unread: boolean
}

export interface AnnouncementChangelog {
  items: AnnouncementItem[]
  unreadCount: number
}

/** The `announcements` slice of the `GET /api/v1/auth/me` response. Null when the feature is off. */
export interface AnnouncementBoot {
  modal: AnnouncementItem | null
  banner: AnnouncementItem | null
  spotlight: AnnouncementItem | null
  badges: AnnouncementItem[]
  changelog: AnnouncementChangelog
}

export interface AnnouncementListResponse extends ApiResponse<
  AnnouncementItem[]
> {
  total: number
  unreadCount: number
}

export interface AnnouncementBootResponse extends ApiResponse<AnnouncementBoot> {}

export interface AnnouncementsMarkedResponse extends ApiResponse {
  updated: number
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────
// Every route answers 403 FORBIDDEN_FEATURE_DISABLED while
// `features.enableAnnouncements` is off. The caller's id always comes from the
// session; a user can only ever change their own state.

@Route('api/v1/announcements')
@Tags('Announcements')
export class AnnouncementsSwaggerController extends Controller {
  /**
   * Everything the app evaluates on boot for the caller (modal, banner,
   * spotlight, badges, changelog). The app refetches this when staff change
   * an announcement, instead of reloading the whole profile.
   */
  @Get('boot')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Announcements returned')
  @Response<ApiErrorResponse>(401, 'Unauthorized')
  async getBoot(): Promise<AnnouncementBootResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * The caller's changelog (notification-bell "What's new" drawer): published,
   * enabled, scheduled-in announcements targeted at their plan and workspace
   * role, newest first. Dismissed items stay listed, marked read.
   * @param limit Page size (1-50, default 20)
   * @param offset Items to skip (default 0)
   */
  @Get('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Announcements returned')
  @Response<ApiErrorResponse>(400, 'Invalid query')
  @Response<ApiErrorResponse>(401, 'Unauthorized')
  async getChangelog(
    @Query() limit?: number,
    @Query() offset?: number,
  ): Promise<AnnouncementListResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Marks every changelog entry the caller can see as read.
   */
  @Post('seen')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Announcements marked as seen')
  @Response<ApiErrorResponse>(401, 'Unauthorized')
  async markAllSeen(): Promise<AnnouncementsMarkedResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Marks one announcement as read for the caller. Idempotent.
   * @param id Announcement id
   */
  @Post('{id}/seen')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Announcement marked as seen')
  @Response<ApiErrorResponse>(400, 'Invalid id')
  @Response<ApiErrorResponse>(401, 'Unauthorized')
  @Response<ApiErrorResponse>(404, 'Not published, or switched off')
  async markSeen(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Dismisses an announcement for the caller so it never shows again (until
   * staff explicitly re-announce it). Idempotent.
   * @param id Announcement id
   */
  @Post('{id}/dismiss')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Announcement dismissed')
  @Response<ApiErrorResponse>(400, 'Invalid id')
  @Response<ApiErrorResponse>(401, 'Unauthorized')
  @Response<ApiErrorResponse>(404, 'Not published, or switched off')
  @Response<ApiErrorResponse>(409, 'The announcement is not dismissible')
  async dismiss(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }
}
