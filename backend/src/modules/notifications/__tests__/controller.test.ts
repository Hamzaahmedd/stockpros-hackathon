jest.mock('../notification-query-service', () => ({
  getNotifications: jest.fn(),
  getNotificationSummary: jest.fn(),
  getNotificationPreferences: jest.fn(),
  updateNotificationPreferences: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  markMultipleAsRead: jest.fn(),
}))

import * as NotificationService from '../notification-query-service'
import * as controller from '../controller'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}
const mockReq = (overrides: Record<string, any> = {}) => ({
  user: { userId: 'user-1' },
  body: {},
  query: {},
  params: {},
  ...overrides,
})
const next = jest.fn()

beforeEach(() => jest.clearAllMocks())

describe('getNotifications', () => {
  it('returns a paginated notification list', async () => {
    ;(NotificationService.getNotifications as jest.Mock).mockResolvedValue({
      data: [{ id: 'n1' }],
      nextCursor: null,
      hasMore: false,
      total: 1,
    })
    const req = mockReq({ query: { limit: '10' } })
    const res = mockRes()
    await controller.getNotifications(req as any, res, next)
    expect(NotificationService.getNotifications).toHaveBeenCalledWith(
      'user-1',
      { limit: 10 },
    )
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1 }))
  })

  it('rejects an invalid cursor', async () => {
    const req = mockReq({ query: { cursor: 'not-a-uuid' } })
    const res = mockRes()
    await controller.getNotifications(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getNotificationSummary', () => {
  it('returns the summary', async () => {
    ;(
      NotificationService.getNotificationSummary as jest.Mock
    ).mockResolvedValue({
      unreadCount: 3,
    })
    const res = mockRes()
    await controller.getNotificationSummary(mockReq() as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unreadCount: 3 } }),
    )
  })

  it('forwards a downstream failure to next()', async () => {
    ;(
      NotificationService.getNotificationSummary as jest.Mock
    ).mockRejectedValue(new Error('x'))
    const res = mockRes()
    await controller.getNotificationSummary(mockReq() as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getPreferences', () => {
  it('returns preferences', async () => {
    ;(
      NotificationService.getNotificationPreferences as jest.Mock
    ).mockResolvedValue({
      dailyDigestEnabled: true,
    })
    const res = mockRes()
    await controller.getPreferences(mockReq() as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { dailyDigestEnabled: true } }),
    )
  })

  it('forwards a downstream failure to next()', async () => {
    ;(
      NotificationService.getNotificationPreferences as jest.Mock
    ).mockRejectedValue(new Error('x'))
    const res = mockRes()
    await controller.getPreferences(mockReq() as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('updatePreferences', () => {
  const validBody = {
    marketInterests: ['ai_tech', 'energy'],
    inAppAlertsEnabled: true,
    emailVolatilityAlertsEnabled: true,
    dailyDigestEnabled: false,
  }

  it('updates preferences', async () => {
    ;(
      NotificationService.updateNotificationPreferences as jest.Mock
    ).mockResolvedValue(validBody)
    const req = mockReq({ body: validBody })
    const res = mockRes()
    await controller.updatePreferences(req as any, res, next)
    expect(
      NotificationService.updateNotificationPreferences,
    ).toHaveBeenCalledWith('user-1', validBody)
  })

  it('rejects duplicate market interests', async () => {
    const req = mockReq({
      body: { ...validBody, marketInterests: ['ai_tech', 'ai_tech'] },
    })
    const res = mockRes()
    await controller.updatePreferences(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('markAsRead', () => {
  it('marks the notification as read', async () => {
    ;(NotificationService.markAsRead as jest.Mock).mockResolvedValue({
      id: 'n1',
    })
    const req = mockReq({ params: { id: 'n1' } })
    const res = mockRes()
    await controller.markAsRead(req as any, res, next)
    expect(NotificationService.markAsRead).toHaveBeenCalledWith('user-1', 'n1')
  })

  it('forwards a downstream failure to next()', async () => {
    ;(NotificationService.markAsRead as jest.Mock).mockRejectedValue(
      new Error('not found'),
    )
    const req = mockReq({ params: { id: 'n1' } })
    const res = mockRes()
    await controller.markAsRead(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('markAllAsRead', () => {
  it('marks all notifications as read', async () => {
    ;(NotificationService.markAllAsRead as jest.Mock).mockResolvedValue({
      updated: 5,
    })
    const res = mockRes()
    await controller.markAllAsRead(mockReq() as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { updated: 5 } }),
    )
  })

  it('forwards a downstream failure to next()', async () => {
    ;(NotificationService.markAllAsRead as jest.Mock).mockRejectedValue(
      new Error('x'),
    )
    const res = mockRes()
    await controller.markAllAsRead(mockReq() as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('markMultipleAsRead', () => {
  it('marks the given notifications as read', async () => {
    ;(NotificationService.markMultipleAsRead as jest.Mock).mockResolvedValue({
      updated: 2,
    })
    const req = mockReq({ body: { notificationIds: ['n1', 'n2'] } })
    const res = mockRes()
    await controller.markMultipleAsRead(req as any, res, next)
    expect(NotificationService.markMultipleAsRead).toHaveBeenCalledWith(
      'user-1',
      ['n1', 'n2'],
    )
  })

  it('rejects an empty notificationIds array', async () => {
    const req = mockReq({ body: { notificationIds: [] } })
    const res = mockRes()
    await controller.markMultipleAsRead(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
