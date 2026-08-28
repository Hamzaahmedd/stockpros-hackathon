import { validateOrThrow } from '../../shared/errors'
import { getUserId, sendSuccess } from '../../shared/utils'
import {
  getNotificationsValidator,
  notificationIdsValidator,
} from './validation'
import type { Request, Response, NextFunction } from 'express'
import * as NotificationService from './notification-query-service'

// ─── Controllers ─────────────────────────────────────────────────────────────

export const getNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req)
    const query = validateOrThrow(getNotificationsValidator, req.query)
    const result = await NotificationService.getNotifications(userId, query)
    sendSuccess(res, {
      message: 'Notifications retrieved successfully',
      data: result.data,
      extra: {
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        total: result.total,
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /notifications/summary
 * Returns unread count + latest 5 notifications.
 */
export const getNotificationSummary = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req)
    const summary = await NotificationService.getNotificationSummary(userId)
    sendSuccess(res, {
      message: 'Notification summary retrieved successfully',
      data: summary,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /notifications/:id/read
 * Mark a single notification as read.
 */
export const markAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req)
    const id = req.params.id as string
    const notification = await NotificationService.markAsRead(userId, id)
    sendSuccess(res, {
      message: 'Notification marked as read',
      data: notification,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /notifications/read-all
 * Mark all unread notifications as read for the authenticated user.
 */
export const markAllAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req)
    const result = await NotificationService.markAllAsRead(userId)
    sendSuccess(res, {
      message: 'All notifications marked as read',
      data: result,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /notifications/read-multiple
 * Mark multiple notifications as read for the authenticated user.
 */
export const markMultipleAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req)
    const { notificationIds } = validateOrThrow(
      notificationIdsValidator,
      req.body,
    )
    const result = await NotificationService.markMultipleAsRead(
      userId,
      notificationIds,
    )
    sendSuccess(res, {
      message: 'Notifications marked as read',
      data: result,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /notifications/:id
 * Delete a single notification.
 */
export const deleteNotification = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req)
    const id = req.params.id as string
    await NotificationService.deleteNotification(userId, id)
    sendSuccess(res, {
      message: 'Notification deleted successfully',
    })
  } catch (err) {
    next(err)
  }
}
