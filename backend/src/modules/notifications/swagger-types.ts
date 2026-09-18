import {
  Controller,
  Get,
  Patch,
  Route,
  Tags,
  Security,
  Path,
  Query,
  Body,
  SuccessResponse,
  Response,
} from 'tsoa'
import { ApiResponse, ApiErrorResponse } from '../../shared/docs-types'

// ─── Models ───────────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

export interface NotificationPreferences {
  marketInterests: (
    'ai_tech' | 'energy' | 'finance' | 'healthcare' | 'growth' | 'consumer'
  )[]
  inAppAlertsEnabled: boolean
  emailVolatilityAlertsEnabled: boolean
  dailyDigestEnabled: boolean
}

export interface MarkMultipleNotificationsReadRequest {
  notificationIds: string[]
}

// ─── Controller (TSOA spec-only — not used at runtime) ────────────────────────

@Route('api/v1/notifications')
@Tags('Notifications')
export class NotificationsSwaggerController extends Controller {
  /**
   * Fetch cursor-paginated notifications for the authenticated user, newest first.
   */
  @Get('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Notifications retrieved successfully')
  async getNotifications(
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<ApiResponse<Notification[]>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Get unread count + latest 5 notifications, for the bell icon badge.
   */
  @Get('summary')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Notification summary retrieved successfully')
  async getNotificationSummary(): Promise<
    ApiResponse<{ unreadCount: number; preview: Notification[] }>
  > {
    throw new Error('tsoa spec-only')
  }

  /** Get the authenticated user's notification preferences. */
  @Get('preferences')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Notification preferences retrieved successfully')
  async getPreferences(): Promise<ApiResponse<NotificationPreferences>> {
    throw new Error('tsoa spec-only')
  }

  /** Update the authenticated user's notification preferences. */
  @Patch('preferences')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Notification preferences updated successfully')
  async updatePreferences(
    @Body() preferences: NotificationPreferences,
  ): Promise<ApiResponse<NotificationPreferences>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Mark all unread notifications as read for the authenticated user.
   */
  @Patch('read-all')
  @Security('bearerAuth')
  @SuccessResponse(200, 'All notifications marked as read')
  async markAllAsRead(): Promise<ApiResponse<{ updated: number }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Mark a specific set of notifications as read.
   */
  @Patch('read-multiple')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Notifications marked as read')
  async markMultipleAsRead(
    @Body() body: MarkMultipleNotificationsReadRequest,
  ): Promise<ApiResponse<{ updated: number }>> {
    throw new Error('tsoa spec-only')
  }

  /**
   * Mark a single notification as read.
   */
  @Patch('{id}/read')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Notification marked as read')
  @Response<ApiErrorResponse>(404, 'Notification not found')
  async markAsRead(@Path() id: string): Promise<ApiResponse<Notification>> {
    throw new Error('tsoa spec-only')
  }
}
