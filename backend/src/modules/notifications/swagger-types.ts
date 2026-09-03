import {
  Controller,
  Get,
  Post,
  Delete,
  Route,
  Tags,
  Security,
  Path,
  Query,
  SuccessResponse,
  Response,
} from 'tsoa'
import {
  ApiResponse,
  ApiErrorResponse,
  PaginatedResponse,
} from '../../shared/docs-types'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/notifications')
@Tags('Notifications')
export class NotificationsSwaggerController extends Controller {
  /**
   * Fetch paginated notifications for the authenticated user, newest first.
   */
  @Get('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Notifications returned')
  async getNotifications(
    @Query() page?: number,
    @Query() limit?: number,
  ): Promise<PaginatedResponse<Notification>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Get the count of unread notifications for the authenticated user.
   */
  @Get('unread-count')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Unread count returned')
  async getUnreadCount(): Promise<ApiResponse<{ count: number }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Mark a specific notification as read.
   */
  @Post('{id}/read')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Notification marked as read')
  @Response<ApiErrorResponse>(404, 'Notification not found')
  async markRead(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Mark all notifications as read for the authenticated user.
   */
  @Post('mark-all-read')
  @Security('bearerAuth')
  @SuccessResponse(200, 'All notifications marked as read')
  async markAllRead(): Promise<ApiResponse<{ updated: number }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Delete a specific notification.
   */
  @Delete('{id}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Notification deleted')
  @Response<ApiErrorResponse>(404, 'Notification not found')
  async deleteNotification(@Path() id: string): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Delete all notifications for the authenticated user.
   */
  @Delete('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'All notifications cleared')
  async clearAll(): Promise<ApiResponse<{ deleted: number }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Send an immediate pre-market digest to the authenticated user.
   */
  @Post('digest/send')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Digest sent')
  async sendDigest(): Promise<ApiResponse> {
    throw new Error('tsoa spec-only')
  }
}
