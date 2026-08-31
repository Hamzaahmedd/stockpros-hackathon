import { Controller, Get, Post, Delete, Route, Tags, Security, Path, Query, SuccessResponse, Response } from 'tsoa'
import { ApiResponse, ApiErrorResponse, PaginatedResponse } from './auth.controller'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  metadata?: Record<string, unknown>
  createdAt: string
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Route('api/notifications')
@Tags('Notifications')
export class NotificationsController extends Controller {
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
}
