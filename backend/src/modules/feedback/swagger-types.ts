import { Body, Controller, Get, Post, Query, Route, Tags, Security, SuccessResponse } from 'tsoa'
import { ApiResponse } from '../../shared/docs-types'
import { FeedbackEntry, FeedbackListRow } from './types'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface SubmitFeedbackRequest {
  /** Feedback message from the user */
  message: string
  /** The app page/route the user was on when they submitted feedback */
  page?: string
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/feedback')
@Tags('Feedback')
export class FeedbackSwaggerController extends Controller {
  /**
   * Submit user feedback (bug report, suggestion, general comment).
   */
  @Post('')
  @Security('bearerAuth')
  @SuccessResponse(201, 'Feedback recorded')
  async createFeedback(
    @Body() body: SubmitFeedbackRequest,
  ): Promise<ApiResponse<FeedbackEntry>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * List submitted feedback (admin only — requires ACCESS_CONTROL:READ + ROLE:READ).
   * @param cursor Pagination cursor (last feedback id from the previous page)
   * @param limit Page size (1-100, default 20)
   */
  @Get('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Feedback list returned')
  async getAllFeedback(
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<ApiResponse<FeedbackListRow[]>> {
    throw new Error('tsoa spec-only')
  }
}
