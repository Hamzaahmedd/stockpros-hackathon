import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Query,
  Request,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from '@tsoa/runtime'
import type { Request as ExpressRequest } from 'express'
import * as NotificationService from './notification-query-service'
import {
  NotificationItem,
  NotificationSummary,
  PaginatedNotifications,
} from './types'
import { getUserId } from '../../shared/utils'

export interface GetNotificationsEnvelopeResponse {
  success: boolean
  message: string
  data: NotificationItem[]
  nextCursor: string | null
  hasMore: boolean
  total: number
}

export interface NotificationDataResponse<T> {
  success: boolean
  message: string
  data: T
}

export interface SimpleNotificationMessageResponse {
  success: boolean
  message: string
}

export interface MarkMultipleNotificationsReadBody {
  notificationIds: string[]
}

export interface NotificationsBatchUpdateResult {
  updated: number
}

@Tags('Notifications')
@Route('api/v1/notifications')
export class NotificationController extends Controller {
  /**
   * Get paginated notifications for the authenticated user.
   */
  @Get('')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async getNotifications(
    @Request() req: ExpressRequest,
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<GetNotificationsEnvelopeResponse> {
    const userId = getUserId(req)
    const result = await NotificationService.getNotifications(userId, {
      cursor,
      limit: limit ?? 20,
    })
    return {
      success: true,
      message: 'Notifications retrieved successfully',
      data: result.data,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      total: result.total,
    }
  }

  /**
   * Get notification summary (unread count + latest 5 notifications).
   */
  @Get('summary')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async getNotificationSummary(
    @Request() req: ExpressRequest,
  ): Promise<NotificationDataResponse<NotificationSummary>> {
    const userId = getUserId(req)
    const summary = await NotificationService.getNotificationSummary(userId)
    return {
      success: true,
      message: 'Notification summary retrieved successfully',
      data: summary,
    }
  }

  /**
   * Mark all unread notifications as read.
   */
  @Patch('read-all')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async markAllAsRead(
    @Request() req: ExpressRequest,
  ): Promise<NotificationDataResponse<NotificationsBatchUpdateResult>> {
    const userId = getUserId(req)
    const result = await NotificationService.markAllAsRead(userId)
    return {
      success: true,
      message: 'All notifications marked as read',
      data: result,
    }
  }

  /**
   * Mark multiple notifications as read.
   */
  @Patch('read-multiple')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async markMultipleAsRead(
    @Request() req: ExpressRequest,
    @Body() body: MarkMultipleNotificationsReadBody,
  ): Promise<NotificationDataResponse<NotificationsBatchUpdateResult>> {
    const userId = getUserId(req)
    const result = await NotificationService.markMultipleAsRead(
      userId,
      body.notificationIds,
    )
    return {
      success: true,
      message: 'Notifications marked as read',
      data: result,
    }
  }

  /**
   * Mark a single notification as read.
   */
  @Patch('{id}/read')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async markAsRead(
    @Request() req: ExpressRequest,
    @Path() id: string,
  ): Promise<NotificationDataResponse<NotificationItem>> {
    const userId = getUserId(req)
    const notification = await NotificationService.markAsRead(userId, id)
    return {
      success: true,
      message: 'Notification marked as read',
      data: notification,
    }
  }

  /**
   * Delete a notification.
   */
  @Delete('{id}')
  @Security('bearerAuth')
  @SuccessResponse(200, 'Success')
  public async deleteNotification(
    @Request() req: ExpressRequest,
    @Path() id: string,
  ): Promise<SimpleNotificationMessageResponse> {
    const userId = getUserId(req)
    await NotificationService.deleteNotification(userId, id)
    return {
      success: true,
      message: 'Notification deleted successfully',
    }
  }
}
