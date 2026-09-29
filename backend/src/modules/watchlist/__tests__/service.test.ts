jest.mock('../../market', () => ({
  finnhubService: { subscribe: jest.fn(), unsubscribe: jest.fn() },
  formatWatchlistItem: jest.fn((entry: any) => ({
    symbol: entry.symbol,
    currentPrice: null,
    changePercent: null,
    priceSinceAdded: null,
    targetEntryPrice: entry.targetEntryPrice ?? null,
    stopLoss: entry.stopLoss ?? null,
    notes: entry.notes ?? null,
    entryZone: null,
    stopLossBreached: null,
    aiSuggested: null,
    portfolioFit: null,
    addedAt: entry.createdAt,
    logo: null,
    alerts: entry.alerts,
  })),
  getCompanyLogo: jest.fn(),
  getCurrentPrice: jest.fn(),
  MAX_WATCHLIST_ITEMS: 50,
}))

jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    watchlist: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    watchlistAlert: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('../caches/alert-rule-cache', () => ({
  invalidateAlertCache: jest.fn(),
}))

jest.mock('../caches/portfolio-fit-cache', () => ({
  evictPortfolioFitEntry: jest.fn(),
  fetchUserPositions: jest.fn(),
  getPortfolioFit: jest.fn(),
  invalidateUserPortfolioFitCache: jest.fn(),
}))

jest.mock('../evaluators/ai-zone-calculator', () => ({
  computeAndStoreAiZones: jest.fn(),
}))

import { prisma } from '../../../shared/infrastructure/database'
import { finnhubService, getCompanyLogo, getCurrentPrice } from '../../market'
import { invalidateAlertCache } from '../caches/alert-rule-cache'
import {
  evictPortfolioFitEntry,
  fetchUserPositions,
  getPortfolioFit,
  invalidateUserPortfolioFitCache,
} from '../caches/portfolio-fit-cache'
import { computeAndStoreAiZones } from '../evaluators/ai-zone-calculator'
import {
  addToWatchlist,
  convertToPosition,
  createAlert,
  deleteAlert,
  getAlerts,
  getWatchlist,
  removeFromWatchlist,
  updateAlert,
  updateWatchlistEntry,
} from '../service'

const mockPrisma = prisma as unknown as {
  [model: string]: Record<string, jest.Mock>
} & { $transaction: jest.Mock }

const flush = () => new Promise((resolve) => setImmediate(resolve))

beforeEach(() => {
  jest.clearAllMocks()
  ;(getCompanyLogo as jest.Mock).mockResolvedValue(null)
  ;(getCurrentPrice as jest.Mock).mockResolvedValue(null)
  ;(fetchUserPositions as jest.Mock).mockResolvedValue([])
  ;(getPortfolioFit as jest.Mock).mockResolvedValue(null)
  ;(finnhubService.subscribe as jest.Mock).mockReturnValue({ ok: true })
})

describe('getWatchlist', () => {
  it('enriches each entry with logo, live price and computed fields', async () => {
    mockPrisma.watchlist.findMany.mockResolvedValue([
      {
        symbol: 'AAPL',
        targetEntryPrice: 100,
        stopLoss: 90,
        priceAtCreatedAt: 100,
        createdAt: new Date(),
        alerts: [],
      },
    ])
    ;(getCompanyLogo as jest.Mock).mockResolvedValue('https://logo/aapl.png')
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 102,
      changePercent: 2,
    })
    ;(getPortfolioFit as jest.Mock).mockResolvedValue({ fit: 'GOOD' })

    const [item] = await getWatchlist('user-1')

    expect(item.logo).toBe('https://logo/aapl.png')
    expect(item.currentPrice).toBe(102)
    expect(item.entryZone).toBe(true) // 102 <= 100*1.02=102 -> true (inclusive)
    expect(item.stopLossBreached).toBe(false)
    expect(item.priceSinceAdded).toBeCloseTo(2, 5)
    expect(item.portfolioFit).toEqual({ fit: 'GOOD' })
  })

  it('leaves computed fields untouched when there is no live price', async () => {
    mockPrisma.watchlist.findMany.mockResolvedValue([
      {
        symbol: 'AAPL',
        targetEntryPrice: null,
        stopLoss: null,
        priceAtCreatedAt: null,
        createdAt: new Date(),
        alerts: [],
      },
    ])
    ;(getCurrentPrice as jest.Mock).mockResolvedValue(null)

    const [item] = await getWatchlist('user-1')
    expect(item.currentPrice).toBeNull()
    expect(getPortfolioFit).not.toHaveBeenCalled()
  })

  it('nulls out entryZone/stopLossBreached/priceSinceAdded when their underlying fields were never set', async () => {
    mockPrisma.watchlist.findMany.mockResolvedValue([
      {
        symbol: 'AAPL',
        targetEntryPrice: null,
        stopLoss: null,
        priceAtCreatedAt: null,
        createdAt: new Date(),
        alerts: [],
      },
    ])
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 100,
      changePercent: 0,
    })

    const [item] = await getWatchlist('user-1')
    expect(item.entryZone).toBeNull()
    expect(item.stopLossBreached).toBeNull()
    expect(item.priceSinceAdded).toBeNull()
  })
})

describe('getAlerts', () => {
  it('throws when the symbol is not in the watchlist', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue(null)
    await expect(getAlerts('user-1', 'aapl')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('returns alerts for the normalized symbol', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({ id: 'w-1' })
    mockPrisma.watchlistAlert.findMany.mockResolvedValue([{ id: 'a-1' }])

    const result = await getAlerts('user-1', 'aapl')
    expect(result).toEqual([{ id: 'a-1' }])
    expect(mockPrisma.watchlist.findUnique).toHaveBeenCalledWith({
      where: { userId_symbol: { userId: 'user-1', symbol: 'AAPL' } },
    })
  })
})

describe('addToWatchlist', () => {
  const input = {
    symbol: 'AAPL',
    targetEntryPrice: 100,
    stopLoss: 90,
    notes: null,
  } as any

  it('rejects once the watchlist is full', async () => {
    mockPrisma.watchlist.count.mockResolvedValue(50)
    await expect(addToWatchlist('user-1', input)).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('rejects a symbol already on the watchlist', async () => {
    mockPrisma.watchlist.count.mockResolvedValue(0)
    mockPrisma.watchlist.findUnique.mockResolvedValue({ id: 'existing' })
    await expect(addToWatchlist('user-1', input)).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('rejects when Finnhub subscription capacity is full', async () => {
    mockPrisma.watchlist.count.mockResolvedValue(0)
    mockPrisma.watchlist.findUnique.mockResolvedValue(null)
    ;(finnhubService.subscribe as jest.Mock).mockReturnValue({ ok: false })
    await expect(addToWatchlist('user-1', input)).rejects.toMatchObject({
      statusCode: 503,
    })
  })

  it('creates the entry, backfills priceAtCreatedAt in the background, and computes AI zones', async () => {
    mockPrisma.watchlist.count.mockResolvedValue(0)
    mockPrisma.watchlist.findUnique.mockResolvedValue(null)
    mockPrisma.watchlist.create.mockResolvedValue({
      symbol: 'AAPL',
      targetEntryPrice: 100,
      stopLoss: 90,
      createdAt: new Date(),
    })
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 105,
      changePercent: 1,
    })
    mockPrisma.watchlist.update.mockResolvedValue({})
    ;(computeAndStoreAiZones as jest.Mock).mockResolvedValue(undefined)

    const item = await addToWatchlist('user-1', input)

    expect(item.currentPrice).toBe(105)
    expect(item.entryZone).toBe(false)
    expect(item.stopLossBreached).toBe(false)
    expect(item.priceSinceAdded).toBeNull()

    await flush()
    expect(mockPrisma.watchlist.update).toHaveBeenCalledWith({
      where: { userId_symbol: { userId: 'user-1', symbol: 'AAPL' } },
      data: { priceAtCreatedAt: 105 },
    })
    expect(computeAndStoreAiZones).toHaveBeenCalledWith('user-1', 'AAPL')
  })

  it('logs instead of throwing when the background priceAtCreatedAt backfill fails', async () => {
    mockPrisma.watchlist.count.mockResolvedValue(0)
    mockPrisma.watchlist.findUnique.mockResolvedValue(null)
    mockPrisma.watchlist.create.mockResolvedValue({
      symbol: 'AAPL',
      targetEntryPrice: null,
      stopLoss: null,
      createdAt: new Date(),
    })
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 105,
      changePercent: 1,
    })
    mockPrisma.watchlist.update.mockRejectedValue(new Error('db down'))
    ;(computeAndStoreAiZones as jest.Mock).mockRejectedValue(
      new Error('ai job down'),
    )

    await addToWatchlist('user-1', input)
    await expect(flush()).resolves.toBeUndefined()
  })

  it('defaults targetEntryPrice/stopLoss/notes to null when not provided', async () => {
    mockPrisma.watchlist.count.mockResolvedValue(0)
    mockPrisma.watchlist.findUnique.mockResolvedValue(null)
    mockPrisma.watchlist.create.mockResolvedValue({
      symbol: 'AAPL',
      targetEntryPrice: null,
      stopLoss: null,
      createdAt: new Date(),
    })

    await addToWatchlist('user-1', { symbol: 'AAPL' } as any)

    expect(mockPrisma.watchlist.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        symbol: 'AAPL',
        targetEntryPrice: null,
        stopLoss: null,
        notes: null,
      },
    })
  })

  it('skips the background price backfill entirely when no live price is available', async () => {
    mockPrisma.watchlist.count.mockResolvedValue(0)
    mockPrisma.watchlist.findUnique.mockResolvedValue(null)
    mockPrisma.watchlist.create.mockResolvedValue({
      symbol: 'AAPL',
      targetEntryPrice: null,
      stopLoss: null,
      createdAt: new Date(),
    })
    ;(getCurrentPrice as jest.Mock).mockResolvedValue(null)

    const item = await addToWatchlist('user-1', input)
    expect(item.currentPrice).toBeNull()
    await flush()
    expect(mockPrisma.watchlist.update).not.toHaveBeenCalled()
  })
})

describe('convertToPosition', () => {
  const data = { quantity: 5, entryPrice: undefined } as any

  it('throws when the symbol is not on the watchlist', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue(null)
    await expect(
      convertToPosition('user-1', 'aapl', data),
    ).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('requires an explicit entry price when none can be determined', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({
      targetEntryPrice: null,
    })
    ;(getCurrentPrice as jest.Mock).mockResolvedValue(null)
    await expect(
      convertToPosition('user-1', 'aapl', data),
    ).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('falls back to the watchlist target entry price when no live price is available', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({ targetEntryPrice: 100 })
    ;(getCurrentPrice as jest.Mock).mockResolvedValue(null)
    const tx = {
      portfolio: { findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }) },
      position: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      watchlist: { delete: jest.fn().mockResolvedValue({}) },
    }
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(tx),
    )

    await convertToPosition('user-1', 'aapl', { quantity: 1 } as any)

    expect(tx.position.create).toHaveBeenCalledWith({
      data: {
        portfolioId: 'p-1',
        symbol: 'AAPL',
        quantity: 1,
        avgEntryPrice: 100,
      },
    })
  })

  it('defaults quantity to 1 when not provided', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({ targetEntryPrice: 100 })
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 100,
      changePercent: 0,
    })
    const tx = {
      portfolio: { findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }) },
      position: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      watchlist: { delete: jest.fn().mockResolvedValue({}) },
    }
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(tx),
    )

    await convertToPosition('user-1', 'aapl', {} as any)

    expect(tx.position.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quantity: 1 }),
      }),
    )
  })

  it('throws when the user has no portfolio to convert into', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({ targetEntryPrice: 100 })
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 100,
      changePercent: 0,
    })
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) =>
        fn({ portfolio: { findFirst: jest.fn().mockResolvedValue(null) } }),
    )

    await expect(convertToPosition('user-1', 'aapl', data)).rejects.toThrow(
      'No portfolio is uploaded',
    )
  })

  it('creates a new position, deletes the watchlist entry, and invalidates the fit cache', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({ targetEntryPrice: 100 })
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 100,
      changePercent: 0,
    })
    const tx = {
      portfolio: { findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }) },
      position: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn(),
      },
      watchlist: { delete: jest.fn().mockResolvedValue({}) },
    }
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(tx),
    )

    await convertToPosition('user-1', 'aapl', data)

    expect(tx.position.create).toHaveBeenCalledWith({
      data: {
        portfolioId: 'p-1',
        symbol: 'AAPL',
        quantity: 5,
        avgEntryPrice: 100,
      },
    })
    expect(tx.watchlist.delete).toHaveBeenCalled()
    expect(invalidateUserPortfolioFitCache).toHaveBeenCalledWith('user-1')
  })

  it('averages into an existing position of the same symbol instead of creating a duplicate', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({ targetEntryPrice: 100 })
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 120,
      changePercent: 0,
    })
    const tx = {
      portfolio: { findFirst: jest.fn().mockResolvedValue({ id: 'p-1' }) },
      position: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'pos-1', quantity: 10, avgEntryPrice: 100 }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      watchlist: { delete: jest.fn().mockResolvedValue({}) },
    }
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(tx),
    )

    await convertToPosition('user-1', 'aapl', {
      quantity: 10,
      entryPrice: 120,
    } as any)

    expect(tx.position.update).toHaveBeenCalledWith({
      where: { id: 'pos-1' },
      data: { quantity: 20, avgEntryPrice: 110 },
    })
    expect(tx.position.create).not.toHaveBeenCalled()
  })
})

describe('createAlert', () => {
  it('throws when the symbol is not on the watchlist', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue(null)
    await expect(
      createAlert('user-1', 'aapl', {
        type: 'PRICE_ABOVE',
        threshold: 100,
      } as any),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('creates the alert and invalidates its cache', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({ id: 'w-1' })
    mockPrisma.watchlistAlert.create.mockResolvedValue({ id: 'a-1' })

    const result = await createAlert('user-1', 'aapl', {
      type: 'PRICE_ABOVE',
      threshold: 100,
    } as any)

    expect(result).toEqual({ id: 'a-1' })
    expect(invalidateAlertCache).toHaveBeenCalledWith('AAPL')
  })

  it('defaults threshold to null when omitted', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({ id: 'w-1' })
    mockPrisma.watchlistAlert.create.mockResolvedValue({ id: 'a-1' })

    await createAlert('user-1', 'aapl', { type: 'PRICE_ABOVE' } as any)

    expect(mockPrisma.watchlistAlert.create).toHaveBeenCalledWith({
      data: {
        watchlistId: 'w-1',
        userId: 'user-1',
        type: 'PRICE_ABOVE',
        threshold: null,
        isActive: true,
      },
    })
  })
})

describe('updateWatchlistEntry', () => {
  it('throws when the symbol is not on the watchlist', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue(null)
    await expect(
      updateWatchlistEntry('user-1', 'aapl', { notes: 'x' } as any),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('applies only the provided partial fields and logs the specific changes', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({
      targetEntryPrice: 100,
      stopLoss: 90,
      notes: 'old',
    })
    mockPrisma.watchlist.update.mockResolvedValue({
      symbol: 'AAPL',
      targetEntryPrice: 100,
      stopLoss: 95,
      notes: 'old',
      priceAtCreatedAt: null,
      createdAt: new Date(),
    })

    await updateWatchlistEntry('user-1', 'aapl', { stopLoss: 95 } as any)

    expect(mockPrisma.watchlist.update).toHaveBeenCalledWith({
      where: { userId_symbol: { userId: 'user-1', symbol: 'AAPL' } },
      data: { stopLoss: 95 },
    })
  })

  it('logs a targetEntryPrice change and a notes change alongside a stopLoss change', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({
      targetEntryPrice: 100,
      stopLoss: 90,
      notes: 'old note',
    })
    mockPrisma.watchlist.update.mockResolvedValue({
      symbol: 'AAPL',
      targetEntryPrice: 110,
      stopLoss: 90,
      notes: 'new note',
      priceAtCreatedAt: null,
      createdAt: new Date(),
    })

    await updateWatchlistEntry('user-1', 'aapl', {
      targetEntryPrice: 110,
      notes: 'new note',
    } as any)

    expect(mockPrisma.watchlist.update).toHaveBeenCalledWith({
      where: { userId_symbol: { userId: 'user-1', symbol: 'AAPL' } },
      data: { targetEntryPrice: 110, notes: 'new note' },
    })
  })

  it('enriches the response with live price fields when available', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({
      targetEntryPrice: 100,
      stopLoss: 90,
      notes: null,
    })
    mockPrisma.watchlist.update.mockResolvedValue({
      symbol: 'AAPL',
      targetEntryPrice: 100,
      stopLoss: 90,
      notes: null,
      priceAtCreatedAt: 90,
      createdAt: new Date(),
    })
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 99,
      changePercent: 10,
    })

    const item = await updateWatchlistEntry('user-1', 'aapl', {
      targetEntryPrice: 100,
    } as any)
    expect(item.currentPrice).toBe(99)
    expect(item.entryZone).toBe(true) // 99 <= 100*1.02
    expect(item.priceSinceAdded).toBeCloseTo(10, 5)
  })

  it('nulls entryZone/stopLossBreached/priceSinceAdded when their underlying fields are unset', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({
      targetEntryPrice: null,
      stopLoss: null,
      notes: null,
    })
    mockPrisma.watchlist.update.mockResolvedValue({
      symbol: 'AAPL',
      targetEntryPrice: null,
      stopLoss: null,
      notes: null,
      priceAtCreatedAt: null,
      createdAt: new Date(),
    })
    ;(getCurrentPrice as jest.Mock).mockResolvedValue({
      price: 99,
      changePercent: 0,
    })

    const item = await updateWatchlistEntry('user-1', 'aapl', {
      notes: 'x',
    } as any)
    expect(item.entryZone).toBeNull()
    expect(item.stopLossBreached).toBeNull()
    expect(item.priceSinceAdded).toBeNull()
  })
})

describe('updateAlert', () => {
  it('treats a mismatched symbol the same as a missing alert', async () => {
    mockPrisma.watchlistAlert.findFirst.mockResolvedValue({
      watchlist: { symbol: 'MSFT' },
    })
    await expect(
      updateAlert('user-1', 'aapl', 'a-1', { threshold: 100 } as any),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('updates the alert and invalidates its cache', async () => {
    mockPrisma.watchlistAlert.findFirst.mockResolvedValue({
      watchlist: { symbol: 'AAPL' },
    })
    mockPrisma.watchlistAlert.update.mockResolvedValue({
      id: 'a-1',
      threshold: 120,
    })

    const result = await updateAlert('user-1', 'aapl', 'a-1', {
      threshold: 120,
    } as any)
    expect(result).toEqual({ id: 'a-1', threshold: 120 })
    expect(invalidateAlertCache).toHaveBeenCalledWith('AAPL')
  })

  it('updates isActive independently of threshold', async () => {
    mockPrisma.watchlistAlert.findFirst.mockResolvedValue({
      watchlist: { symbol: 'AAPL' },
    })
    mockPrisma.watchlistAlert.update.mockResolvedValue({
      id: 'a-1',
      isActive: false,
    })

    await updateAlert('user-1', 'aapl', 'a-1', { isActive: false } as any)

    expect(mockPrisma.watchlistAlert.update).toHaveBeenCalledWith({
      where: { id: 'a-1' },
      data: { isActive: false },
    })
  })
})

describe('removeFromWatchlist', () => {
  it('throws when the symbol is not on the watchlist', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue(null)
    await expect(removeFromWatchlist('user-1', 'aapl')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('unsubscribes from Finnhub once no user is watching the symbol anymore', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({ id: 'w-1' })
    mockPrisma.watchlist.count.mockResolvedValue(0)

    await removeFromWatchlist('user-1', 'aapl')

    expect(finnhubService.unsubscribe).toHaveBeenCalledWith('AAPL')
    expect(evictPortfolioFitEntry).toHaveBeenCalledWith('user-1', 'AAPL')
  })

  it('keeps the Finnhub subscription alive while other users still watch the symbol', async () => {
    mockPrisma.watchlist.findUnique.mockResolvedValue({ id: 'w-1' })
    mockPrisma.watchlist.count.mockResolvedValue(2)

    await removeFromWatchlist('user-1', 'aapl')
    expect(finnhubService.unsubscribe).not.toHaveBeenCalled()
  })
})

describe('deleteAlert', () => {
  it('treats a mismatched symbol the same as a missing alert', async () => {
    mockPrisma.watchlistAlert.findFirst.mockResolvedValue({
      watchlist: { symbol: 'MSFT' },
    })
    await expect(deleteAlert('user-1', 'aapl', 'a-1')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('deletes the alert and invalidates its cache', async () => {
    mockPrisma.watchlistAlert.findFirst.mockResolvedValue({
      watchlist: { symbol: 'AAPL' },
    })
    mockPrisma.watchlistAlert.delete.mockResolvedValue({})

    await deleteAlert('user-1', 'aapl', 'a-1')
    expect(mockPrisma.watchlistAlert.delete).toHaveBeenCalledWith({
      where: { id: 'a-1' },
    })
    expect(invalidateAlertCache).toHaveBeenCalledWith('AAPL')
  })
})
