jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    notification: { create: jest.fn() },
  },
}))

jest.mock('../../../shared/infrastructure/realtime/socket-server', () => ({
  SocketServer: { getInstance: jest.fn() },
}))

jest.mock('../infrastructure/email-worker', () => ({
  enqueueEmail: jest.fn(),
}))

import { prisma } from '../../../shared/infrastructure/database'
import { SocketServer } from '../../../shared/infrastructure/realtime/socket-server'
import { enqueueEmail } from '../infrastructure/email-worker'
import {
  dispatchNotification,
  formatNotification,
} from '../notification-dispatcher'

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock }
  notification: { create: jest.Mock }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.notification.create.mockResolvedValue({ id: 'n1' })
  ;(SocketServer.getInstance as jest.Mock).mockReturnValue(null)
  ;(enqueueEmail as jest.Mock).mockResolvedValue(undefined)
})

describe('formatNotification', () => {
  const cases: [string, number | null | undefined][] = [
    ['PRICE_ABOVE', 100],
    ['PRICE_BELOW', 100],
    ['PCT_CHANGE_UP', 5],
    ['PCT_CHANGE_DOWN', 5],
    ['ENTRY_ZONE', null],
    ['STOP_LOSS_BREACHED', 90],
    ['EARNINGS_APPROACHING', null],
    ['DIVIDEND_APPROACHING', null],
    ['ANALYST_RATING_CHANGE', null],
    ['NEWS_PUBLISHED', null],
    ['SEC_FILING', null],
    ['AI_SIGNAL_CHANGED', null],
  ]

  it.each(cases)(
    'produces a non-empty title/body for %s',
    (type, threshold) => {
      const result = formatNotification('AAPL', type as any, 100, threshold)
      expect(result.title).toContain('AAPL')
      expect(result.body).toContain('AAPL')
    },
  )

  it('falls back to a generic message for an unrecognized alert type', () => {
    const result = formatNotification('AAPL', 'SOME_FUTURE_TYPE' as any, 100)
    expect(result.title).toBe('AAPL alert triggered')
  })
})

describe('dispatchNotification', () => {
  it('does nothing when the user has no preferences on file', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    await dispatchNotification('user-1', 'AAPL', 'PRICE_ABOVE', 100, 90)
    expect(mockPrisma.notification.create).not.toHaveBeenCalled()
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('creates an in-app notification and emits over a live socket', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'a@example.com',
      inAppAlertsEnabled: true,
      emailVolatilityAlertsEnabled: false,
    })
    const mockIo = { to: jest.fn().mockReturnThis(), emit: jest.fn() }
    ;(SocketServer.getInstance as jest.Mock).mockReturnValue({ io: mockIo })

    await dispatchNotification('user-1', 'AAPL', 'PRICE_ABOVE', 100, 90)

    expect(mockPrisma.notification.create).toHaveBeenCalled()
    expect(mockIo.to).toHaveBeenCalledWith('user:user-1')
    expect(mockIo.emit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ read: false }),
    )
  })

  it('still creates the notification when there is no live socket instance', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'a@example.com',
      inAppAlertsEnabled: true,
      emailVolatilityAlertsEnabled: false,
    })
    await dispatchNotification('user-1', 'AAPL', 'PRICE_ABOVE', 100, 90)
    expect(mockPrisma.notification.create).toHaveBeenCalled()
  })

  it('skips the in-app notification entirely when the user has disabled it', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'a@example.com',
      inAppAlertsEnabled: false,
      emailVolatilityAlertsEnabled: false,
    })
    await dispatchNotification('user-1', 'AAPL', 'PRICE_ABOVE', 100, 90)
    expect(mockPrisma.notification.create).not.toHaveBeenCalled()
  })

  it('logs and continues when the socket emit itself throws', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'a@example.com',
      inAppAlertsEnabled: true,
      emailVolatilityAlertsEnabled: false,
    })
    ;(SocketServer.getInstance as jest.Mock).mockImplementation(() => {
      throw new Error('socket server down')
    })
    await expect(
      dispatchNotification('user-1', 'AAPL', 'PRICE_ABOVE', 100, 90),
    ).resolves.toBeUndefined()
  })

  it('enqueues an email when the user has volatility email alerts enabled', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'a@example.com',
      inAppAlertsEnabled: false,
      emailVolatilityAlertsEnabled: true,
    })
    await dispatchNotification('user-1', 'AAPL', 'PRICE_ABOVE', 100, 90)
    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@example.com',
        userId: 'user-1',
        symbol: 'AAPL',
      }),
    )
  })

  it('skips the email entirely when the user has disabled it', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'a@example.com',
      inAppAlertsEnabled: false,
      emailVolatilityAlertsEnabled: false,
    })
    await dispatchNotification('user-1', 'AAPL', 'PRICE_ABOVE', 100, 90)
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('logs and continues (does not throw) when enqueuing the email fails', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'a@example.com',
      inAppAlertsEnabled: false,
      emailVolatilityAlertsEnabled: true,
    })
    ;(enqueueEmail as jest.Mock).mockRejectedValue(new Error('queue down'))
    await expect(
      dispatchNotification('user-1', 'AAPL', 'PRICE_ABOVE', 100, 90),
    ).resolves.toBeUndefined()
  })
})
