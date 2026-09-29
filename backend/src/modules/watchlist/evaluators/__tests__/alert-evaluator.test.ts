jest.mock('../../../../shared/infrastructure/database', () => ({
  prisma: {
    alertLog: { findFirst: jest.fn(), create: jest.fn() },
    watchlistAlert: { findMany: jest.fn() },
  },
}))

jest.mock('../../../market', () => ({
  priceCache: new Map(),
}))

jest.mock('../../../notifications', () => ({
  dispatchNotification: jest.fn(),
}))

jest.mock('../../caches/alert-rule-cache', () => ({
  getActiveAlertsForSymbol: jest.fn(),
}))

import { prisma } from '../../../../shared/infrastructure/database'
import { priceCache } from '../../../market'
import { dispatchNotification } from '../../../notifications'
import { getActiveAlertsForSymbol } from '../../caches/alert-rule-cache'
import { evaluateAlertsForTick } from '../alert-evaluator'

const mockPrisma = prisma as unknown as {
  alertLog: { findFirst: jest.Mock; create: jest.Mock }
  watchlistAlert: { findMany: jest.Mock }
}

const baseAlert = (overrides: Record<string, any> = {}) => ({
  id: 'alert-1',
  userId: 'user-1',
  type: 'PRICE_ABOVE',
  threshold: 100,
  watchlist: { targetEntryPrice: null, stopLoss: null },
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  priceCache.clear()
  ;(getActiveAlertsForSymbol as jest.Mock).mockResolvedValue([
    { id: 'alert-1' },
  ])
  mockPrisma.alertLog.findFirst.mockResolvedValue(null)
  mockPrisma.alertLog.create.mockResolvedValue({})
  ;(dispatchNotification as jest.Mock).mockResolvedValue(undefined)
})

describe('evaluateAlertsForTick — cache/DB short-circuits', () => {
  it('does nothing when the cache has no active alerts for the symbol', async () => {
    ;(getActiveAlertsForSymbol as jest.Mock).mockResolvedValue([])
    await evaluateAlertsForTick('AAPL', 150)
    expect(mockPrisma.watchlistAlert.findMany).not.toHaveBeenCalled()
  })

  it('does nothing when the full DB read finds no still-active alerts', async () => {
    mockPrisma.watchlistAlert.findMany.mockResolvedValue([])
    await evaluateAlertsForTick('AAPL', 150)
    expect(dispatchNotification).not.toHaveBeenCalled()
  })

  it('never throws — logs and swallows an error from the alert cache lookup itself', async () => {
    ;(getActiveAlertsForSymbol as jest.Mock).mockRejectedValue(
      new Error('cache down'),
    )
    await expect(evaluateAlertsForTick('AAPL', 150)).resolves.toBeUndefined()
  })
})

describe('evaluateAlertsForTick — rule evaluation', () => {
  const runWith = async (
    alert: ReturnType<typeof baseAlert>,
    currentPrice: number,
  ) => {
    mockPrisma.watchlistAlert.findMany.mockResolvedValue([alert])
    await evaluateAlertsForTick('AAPL', currentPrice)
  }

  it('fires PRICE_ABOVE when the price has reached the threshold', async () => {
    await runWith(baseAlert({ type: 'PRICE_ABOVE', threshold: 100 }), 100)
    expect(dispatchNotification).toHaveBeenCalled()
  })

  it('does not fire PRICE_ABOVE below the threshold', async () => {
    await runWith(baseAlert({ type: 'PRICE_ABOVE', threshold: 100 }), 99)
    expect(dispatchNotification).not.toHaveBeenCalled()
  })

  it('fires PRICE_BELOW when the price has dropped to the threshold', async () => {
    await runWith(baseAlert({ type: 'PRICE_BELOW', threshold: 100 }), 100)
    expect(dispatchNotification).toHaveBeenCalled()
  })

  it('fires PCT_CHANGE_UP when the change percent meets the threshold', async () => {
    priceCache.set('AAPL', { price: 100, changePercent: 5 } as any)
    await runWith(baseAlert({ type: 'PCT_CHANGE_UP', threshold: 5 }), 100)
    expect(dispatchNotification).toHaveBeenCalled()
  })

  it('fires PCT_CHANGE_DOWN when the change percent has dropped enough', async () => {
    priceCache.set('AAPL', { price: 100, changePercent: -6 } as any)
    await runWith(baseAlert({ type: 'PCT_CHANGE_DOWN', threshold: 5 }), 100)
    expect(dispatchNotification).toHaveBeenCalled()
  })

  it('never fires PCT_CHANGE_DOWN when its threshold is null', async () => {
    priceCache.set('AAPL', { price: 100, changePercent: -50 } as any)
    await runWith(baseAlert({ type: 'PCT_CHANGE_DOWN', threshold: null }), 100)
    expect(dispatchNotification).not.toHaveBeenCalled()
  })

  it('defaults changePercent to 0 when the symbol has no price-cache entry', async () => {
    await runWith(baseAlert({ type: 'PCT_CHANGE_UP', threshold: 0.01 }), 100)
    expect(dispatchNotification).not.toHaveBeenCalled()
  })

  it('fires ENTRY_ZONE when price is within 2% of the target entry', async () => {
    await runWith(
      baseAlert({
        type: 'ENTRY_ZONE',
        watchlist: { targetEntryPrice: 100, stopLoss: null },
      }),
      101,
    )
    expect(dispatchNotification).toHaveBeenCalled()
  })

  it('never fires ENTRY_ZONE when there is no target entry price set', async () => {
    await runWith(
      baseAlert({
        type: 'ENTRY_ZONE',
        watchlist: { targetEntryPrice: null, stopLoss: null },
      }),
      100,
    )
    expect(dispatchNotification).not.toHaveBeenCalled()
  })

  it('fires STOP_LOSS_BREACHED when price has fallen to the stop level', async () => {
    await runWith(
      baseAlert({
        type: 'STOP_LOSS_BREACHED',
        watchlist: { targetEntryPrice: null, stopLoss: 90 },
      }),
      90,
    )
    expect(dispatchNotification).toHaveBeenCalled()
  })

  it('never fires an event-based alert type from the tick handler (evaluated by cron jobs instead)', async () => {
    await runWith(baseAlert({ type: 'EARNINGS_APPROACHING' }), 999_999)
    expect(dispatchNotification).not.toHaveBeenCalled()
  })

  it('never fires an unrecognized alert type', async () => {
    await runWith(baseAlert({ type: 'SOME_FUTURE_TYPE' as any }), 999_999)
    expect(dispatchNotification).not.toHaveBeenCalled()
  })
})

describe('evaluateAlertsForTick — cooldown and dispatch', () => {
  it('suppresses a re-fire within the 1-hour cooldown window', async () => {
    mockPrisma.watchlistAlert.findMany.mockResolvedValue([baseAlert()])
    mockPrisma.alertLog.findFirst.mockResolvedValue({ firedAt: new Date() })
    await evaluateAlertsForTick('AAPL', 100)
    expect(mockPrisma.alertLog.create).not.toHaveBeenCalled()
    expect(dispatchNotification).not.toHaveBeenCalled()
  })

  it('fires again once the cooldown window has passed', async () => {
    mockPrisma.watchlistAlert.findMany.mockResolvedValue([baseAlert()])
    mockPrisma.alertLog.findFirst.mockResolvedValue({
      firedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
    })
    await evaluateAlertsForTick('AAPL', 100)
    expect(mockPrisma.alertLog.create).toHaveBeenCalledWith({
      data: { alertId: 'alert-1' },
    })
    expect(dispatchNotification).toHaveBeenCalled()
  })

  it('logs the alert fire even if notification dispatch itself fails', async () => {
    mockPrisma.watchlistAlert.findMany.mockResolvedValue([baseAlert()])
    ;(dispatchNotification as jest.Mock).mockRejectedValue(
      new Error('email down'),
    )
    await expect(evaluateAlertsForTick('AAPL', 100)).resolves.toBeUndefined()
    expect(mockPrisma.alertLog.create).toHaveBeenCalled()
  })

  it('evaluates multiple alerts for the same tick independently', async () => {
    mockPrisma.watchlistAlert.findMany.mockResolvedValue([
      baseAlert({ id: 'a1', type: 'PRICE_ABOVE', threshold: 100 }),
      baseAlert({ id: 'a2', type: 'PRICE_ABOVE', threshold: 200 }),
    ])
    await evaluateAlertsForTick('AAPL', 150)
    expect(dispatchNotification).toHaveBeenCalledTimes(1)
  })
})
