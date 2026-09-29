jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    notification: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

import { prisma } from '../../../shared/infrastructure/database'
import {
  deleteExpiredNotifications,
  getNotificationPreferences,
  getNotifications,
  getNotificationSummary,
  markAllAsRead,
  markAsRead,
  markMultipleAsRead,
  updateNotificationPreferences,
} from '../notification-query-service'

const mockPrisma = prisma as unknown as {
  [model: string]: Record<string, jest.Mock>
}

beforeEach(() => jest.clearAllMocks())

describe('getNotificationPreferences', () => {
  it('throws when the user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    await expect(getNotificationPreferences('missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('filters out any stale/unrecognized market interest values', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      marketInterests: ['ai_tech', 'a_removed_interest'],
      inAppAlertsEnabled: true,
      emailVolatilityAlertsEnabled: true,
      dailyDigestEnabled: true,
    })
    const result = await getNotificationPreferences('user-1')
    expect(result.marketInterests).toEqual(['ai_tech'])
  })
})

describe('updateNotificationPreferences', () => {
  it('persists and returns the updated preferences', async () => {
    const prefs = {
      marketInterests: ['energy'],
      inAppAlertsEnabled: false,
      emailVolatilityAlertsEnabled: true,
      dailyDigestEnabled: true,
    }
    mockPrisma.user.update.mockResolvedValue(prefs)
    const result = await updateNotificationPreferences('user-1', prefs as any)
    expect(result).toEqual(prefs)
  })
})

describe('getNotifications', () => {
  it('rejects an invalid or expired cursor', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null)
    await expect(
      getNotifications('user-1', { cursor: 'missing', limit: 20 } as any),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('paginates with hasMore/nextCursor when more rows exist than the limit', async () => {
    mockPrisma.notification.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({ id: `n${i}` })),
    )
    mockPrisma.notification.count.mockResolvedValue(5)
    const result = await getNotifications('user-1', { limit: 2 } as any)
    expect(result.hasMore).toBe(true)
    expect(result.nextCursor).toBe('n1')
    expect(result.total).toBe(5)
  })

  it('resolves a valid cursor before paginating', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue({
      createdAt: new Date('2024-01-01'),
    })
    mockPrisma.notification.findMany.mockResolvedValue([])
    mockPrisma.notification.count.mockResolvedValue(0)
    await getNotifications('user-1', { cursor: 'n0', limit: 20 } as any)
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { createdAt: { lt: new Date('2024-01-01') } },
            { createdAt: new Date('2024-01-01'), id: { lt: 'n0' } },
          ],
        }),
      }),
    )
  })
})

describe('getNotificationSummary', () => {
  it('returns unread count and the latest 5 notifications', async () => {
    mockPrisma.notification.count.mockResolvedValue(3)
    mockPrisma.notification.findMany.mockResolvedValue([{ id: 'n1' }])
    const result = await getNotificationSummary('user-1')
    expect(result).toEqual({ unreadCount: 3, preview: [{ id: 'n1' }] })
  })
})

describe('markAsRead', () => {
  it('throws when the notification does not belong to the user (or does not exist)', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null)
    await expect(markAsRead('user-1', 'n1')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('is a no-op when the notification is already read', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue({
      id: 'n1',
      read: true,
    })
    const result = await markAsRead('user-1', 'n1')
    expect(result).toEqual({ id: 'n1', read: true })
    expect(mockPrisma.notification.update).not.toHaveBeenCalled()
  })

  it('marks an unread notification as read', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue({
      id: 'n1',
      read: false,
    })
    mockPrisma.notification.update.mockResolvedValue({ id: 'n1', read: true })
    const result = await markAsRead('user-1', 'n1')
    expect(result).toEqual({ id: 'n1', read: true })
  })
})

describe('markAllAsRead / markMultipleAsRead', () => {
  it('marks all unread notifications as read', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 4 })
    const result = await markAllAsRead('user-1')
    expect(result).toEqual({ updated: 4 })
  })

  it('marks only the given notifications as read', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 2 })
    const result = await markMultipleAsRead('user-1', ['n1', 'n2'])
    expect(result).toEqual({ updated: 2 })
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', id: { in: ['n1', 'n2'] }, read: false },
      data: { read: true },
    })
  })
})

describe('deleteExpiredNotifications', () => {
  it('deletes notifications older than the retention window', async () => {
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 10 })
    const result = await deleteExpiredNotifications(30)
    expect(result).toEqual({ deleted: 10 })
    const cutoffArg =
      mockPrisma.notification.deleteMany.mock.calls[0][0].where.createdAt.lt
    expect(cutoffArg).toBeInstanceOf(Date)
  })
})
