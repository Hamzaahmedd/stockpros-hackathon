import {
  Body,
  Controller,
  Get,
  Patch,
  Path,
  Post,
  Query,
  Response,
  Route,
  Tags,
  Security,
  SuccessResponse,
} from 'tsoa'
import { ApiErrorResponse, ApiResponse } from '../../shared/docs-types'
import {
  FeedbackEntry,
  FeedbackListRow,
  FeedbackStatusChange,
  FeedbackStatusCounts,
} from './types'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface FeedbackClientMetadata {
  /**
   * The browser's user agent string.
   * @maxLength 300
   */
  userAgent?: string
  viewport?: {
    /** @minimum 1 @maximum 20000 */
    width: number
    /** @minimum 1 @maximum 20000 */
    height: number
  }
  /**
   * The web app version.
   * @maxLength 40
   */
  appVersion?: string
}

export interface SubmitFeedbackRequest {
  /**
   * Feedback message from the user
   * @maxLength 2000
   */
  message: string
  /** The app page/route the user was on when they submitted feedback */
  page?: string
  /** What the user is telling us (optional). */
  category?: 'BUG' | 'FEATURE_REQUEST' | 'GENERAL'
  /**
   * Technical context reported by the browser. No other keys are accepted: the
   * plan tier is added by the server from the signed-in session, never taken from here.
   */
  metadata?: FeedbackClientMetadata
}

export interface UpdateFeedbackStatusRequest {
  status: 'NEW' | 'READ' | 'ARCHIVED'
}

export interface FeedbackListResponse extends ApiResponse<FeedbackListRow[]> {
  nextCursor: string | null
  hasMore: boolean
  /** Entries matching the status filter. */
  total: number
  /** Entries per status across the whole inbox, whatever the filter. */
  counts: FeedbackStatusCounts
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/v1/feedback')
@Tags('Feedback')
export class FeedbackSwaggerController extends Controller {
  /**
   * Submit user feedback (bug report, suggestion, general comment). Limited to
   * a few submissions per minute per user. When a chat webhook is configured
   * the team is pinged after the feedback is saved (best effort: a webhook
   * problem never fails the request).
   */
  @Post('')
  @Security('bearerAuth')
  @SuccessResponse(201, 'Feedback recorded')
  @Response<ApiErrorResponse>(400, 'Invalid message, category or metadata')
  @Response<ApiErrorResponse>(429, 'Too many submissions')
  async createFeedback(
    @Body() body: SubmitFeedbackRequest,
  ): Promise<ApiResponse<FeedbackEntry>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * List submitted feedback, newest first (admin only — requires ACCESS_CONTROL:READ + ROLE:READ).
   * Works in both the role-based and the tier-based workflow.
   * @param cursor Pagination cursor (last feedback id from the previous page)
   * @param limit Page size (1-100, default 20)
   * @param status Only entries in this triage state (default: all)
   */
  @Get('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Feedback list returned')
  async getAllFeedback(
    @Query() cursor?: string,
    @Query() limit?: number,
    @Query() status?: 'NEW' | 'READ' | 'ARCHIVED',
  ): Promise<FeedbackListResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Mark an entry NEW, READ or ARCHIVED (admin only — requires ACCESS_CONTROL:READ + ROLE:READ).
   * Idempotent: setting the state it already has changes nothing (`changed: false`).
   * The change is recorded with who made it and when.
   * @param id Feedback id
   */
  @Patch('{id}/status')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Status updated')
  @Response<ApiErrorResponse>(400, 'Invalid id or status')
  @Response<ApiErrorResponse>(404, 'Feedback not found')
  async setFeedbackStatus(
    @Path() id: string,
    @Body() body: UpdateFeedbackStatusRequest,
  ): Promise<ApiResponse<FeedbackStatusChange>> {
    throw new Error('tsoa spec-only')
  }
}
