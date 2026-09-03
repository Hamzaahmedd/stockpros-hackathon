import { prisma } from '../../shared/infrastructure/database'
import { AppError } from '../../shared/errors'
import type { GetNotificationsQuery } from './validation'
import type {
  NotificationItem,
  NotificationPreferences,
  PaginatedNotifications,
  NotificationSummary,
} from './types'

// ─── Notification Preferences ────────────────────────────────────────────────

export const getNotificationPreferences = async (
  userId: string,
): Promise<NotificationPreferences> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      marketInterests: true,
      inAppAlertsEnabled: true,
      emailVolatilityAlertsEnabled: true,
      dailyDigestEnabled: true,
    },
  })
  if (!user) throw new AppError('User not found', 404)

  return user
}

export const updateNotificationPreferences = async (
  userId: string,
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: preferences,
    select: {
      marketInterests: true,
      inAppAlertsEnabled: true,
      emailVolatilityAlertsEnabled: true,
      dailyDigestEnabled: true,
    },
  })

  return user
}

// ─── Get Notifications (cursor-based) ────────────────────────────────────────

/**
 * Cursor-based pagination keyed on `id`.
 *
 * Why cursor over offset for notifications:
 *   - New notifications are written continuously — offset pagination causes
 *     duplicate or skipped rows as the list shifts between page requests
 *   - Cursor pins to a stable position in the sorted result set
 *
 * Sort order: createdAt DESC (newest first), with id DESC as tiebreaker
 * to guarantee stable ordering when multiple notifications share a timestamp.
 */
export const getNotifications = async (
  userId: string,
  query: GetNotificationsQuery,
): Promise<PaginatedNotifications> => {
  const { cursor, limit } = query

  // Resolve the cursor row so we have its createdAt for the range filter
  let cursorCreatedAt: Date | undefined
  if (cursor) {
    const cursorRow = await prisma.notification.findFirst({
      where: { id: cursor, userId },
      select: { createdAt: true },
    })
    if (!cursorRow) {
      throw new AppError('Invalid or expired cursor', 400)
    }
    cursorCreatedAt = cursorRow.createdAt
  }

  // Fetch limit + 1 so we can detect whether a next page exists
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      // If cursor provided, fetch rows strictly older than the cursor row.
      // Using createdAt + id ensures stable ordering with no gaps.
      ...(cursorCreatedAt && {
        OR: [
          { createdAt: { lt: cursorCreatedAt } },
          { createdAt: cursorCreatedAt, id: { lt: cursor } },
        ],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })

  const hasNextPage = rows.length > limit
  const data = hasNextPage ? rows.slice(0, limit) : rows
  const nextCursor = hasNextPage ? data[data.length - 1].id : null

  // Unread count — inexpensive indexed query
  const total = await prisma.notification.count({
    where: { userId, read: false },
  })

  return { data, nextCursor, hasMore: hasNextPage, total }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

/**
 * Returns unread count + latest 5 notifications (any read state).
 * Designed for the bell icon badge — single fast response, no pagination.
 */
export const getNotificationSummary = async (
  userId: string,
): Promise<NotificationSummary> => {
  const [unreadCount, preview] = await Promise.all([
    prisma.notification.count({ where: { userId, read: false } }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
    }),
  ])

  return { unreadCount, preview }
}

// ─── Mark Single as Read ──────────────────────────────────────────────────────

export const markAsRead = async (
  userId: string,
  notificationId: string,
): Promise<NotificationItem> => {
  // Ownership check — user may only update their own notifications
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  })
  if (!notification) {
    throw new AppError('Notification not found', 404)
  }

  // No-op if already read — avoids unnecessary DB write
  if (notification.read) return notification

  return prisma.notification.update({
    where: { id: notificationId },
    data: { read: true },
  })
}

// ─── Mark All as Read ─────────────────────────────────────────────────────────

export const markAllAsRead = async (
  userId: string,
): Promise<{ updated: number }> => {
  const result = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  })

  return { updated: result.count }
}

// ─── Mark Multiple as Read ────────────────────────────────────────────────────

export const markMultipleAsRead = async (
  userId: string,
  notificationIds: string[],
): Promise<{ updated: number }> => {
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      id: { in: notificationIds },
      read: false,
    },
    data: { read: true },
  })

  return { updated: result.count }
}

// ─── Delete Single ────────────────────────────────────────────────────────────

export const deleteNotification = async (
  userId: string,
  notificationId: string,
): Promise<void> => {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  })
  if (!notification) {
    throw new AppError('Notification not found', 404)
  }

  await prisma.notification.delete({ where: { id: notificationId } })
}
