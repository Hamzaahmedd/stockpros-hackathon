import { AppError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import {
  finnhubService,
  formatWatchlistItem,
  getCompanyLogo,
  getCurrentPrice,
  MAX_WATCHLIST_ITEMS,
} from '../market'
import { invalidateAlertCache } from './caches/alert-rule-cache'
import {
  evictPortfolioFitEntry,
  getPortfolioFit,
  invalidateUserPortfolioFitCache,
} from './caches/portfolio-fit-cache'
import { computeAndStoreAiZones } from './evaluators/ai-zone-calculator'
import { WatchlistItemResponse } from './types'
import type {
  AddToWatchlistInput,
  ConvertToPositionInput,
  CreateAlertInput,
  UpdateAlertInput,
  UpdateWatchlistInput,
} from './validation'

// ── GET Operations ──
export const getWatchlist = async (
  userId: string,
): Promise<WatchlistItemResponse[]> => {
  const entries = await prisma.watchlist.findMany({
    where: { userId },
    include: { alerts: true },
    orderBy: { createdAt: 'desc' },
  })

  const items = await Promise.all(
    entries.map(async (entry) => {
      const item = formatWatchlistItem(entry)

      item.logo = await getCompanyLogo(entry.symbol)

      const priceData = await getCurrentPrice(entry.symbol)
      if (priceData) {
        item.currentPrice = priceData.price
        item.changePercent = priceData.changePercent
      }

      if (item.currentPrice !== null) {
        const price = item.currentPrice

        item.entryZone =
          entry.targetEntryPrice !== null
            ? price <= entry.targetEntryPrice * 1.02
            : null

        item.stopLossBreached =
          entry.stopLoss !== null ? price <= entry.stopLoss : null

        item.priceSinceAdded =
          entry.priceAtCreatedAt !== null
            ? ((price - entry.priceAtCreatedAt) / entry.priceAtCreatedAt) * 100
            : null

        item.portfolioFit = await getPortfolioFit(userId, entry.symbol, price)
      }

      return item
    }),
  )

  return items
}

export const getAlerts = async (userId: string, symbol: string) => {
  const normalizedSymbol = symbol.toUpperCase()

  const watchlistEntry = await prisma.watchlist.findUnique({
    where: { userId_symbol: { userId, symbol: normalizedSymbol } },
  })
  if (!watchlistEntry) {
    throw new AppError(`${normalizedSymbol} not found in your watchlist`, 404)
  }

  return prisma.watchlistAlert.findMany({
    where: {
      watchlistId: watchlistEntry.id,
      userId,
    },
    orderBy: { createdAt: 'desc' },
  })
}

// ── CREATE Operations ──
export const addToWatchlist = async (
  userId: string,
  data: AddToWatchlistInput,
): Promise<WatchlistItemResponse> => {
  const count = await prisma.watchlist.count({ where: { userId } })
  if (count >= MAX_WATCHLIST_ITEMS) {
    throw new AppError(
      `Watchlist is full. Maximum of ${MAX_WATCHLIST_ITEMS} items allowed.`,
      400,
    )
  }

  const existing = await prisma.watchlist.findUnique({
    where: { userId_symbol: { userId, symbol: data.symbol } },
  })
  if (existing) {
    throw new AppError(`${data.symbol} is already in your watchlist`, 409)
  }

  const subscription = finnhubService.subscribe(data.symbol)
  if (!subscription.ok) {
    throw new AppError(
      'Symbol monitoring capacity is currently full. Please try again later.',
      503,
    )
  }

  const entry = await prisma.watchlist.create({
    data: {
      userId,
      symbol: data.symbol,
      targetEntryPrice: data.targetEntryPrice ?? null,
      stopLoss: data.stopLoss ?? null,
      notes: data.notes ?? null,
    },
  })

  const priceData = await getCurrentPrice(data.symbol)

  if (priceData) {
    setImmediate(async () => {
      try {
        await prisma.watchlist.update({
          where: { userId_symbol: { userId, symbol: data.symbol } },
          data: { priceAtCreatedAt: priceData.price },
        })
      } catch (err) {
        logger.error(
          `[Watchlist] Failed to store priceAtCreatedAt for ${data.symbol}`,
          err,
        )
      }
    })
  }

  setImmediate(async () => {
    try {
      await computeAndStoreAiZones(userId, data.symbol)
    } catch (err) {
      logger.error(`[Watchlist] AI zone job failed for ${data.symbol}`, err)
    }
  })

  const item = formatWatchlistItem(entry)
  item.logo = await getCompanyLogo(data.symbol)

  if (priceData) {
    item.currentPrice = priceData.price
    item.changePercent = priceData.changePercent

    const price = priceData.price

    item.entryZone =
      entry.targetEntryPrice !== null
        ? price <= entry.targetEntryPrice * 1.02
        : null

    item.stopLossBreached =
      entry.stopLoss !== null ? price <= entry.stopLoss : null

    item.priceSinceAdded = null

    item.portfolioFit = await getPortfolioFit(userId, entry.symbol, price)
  }

  return item
}

export const convertToPosition = async (
  userId: string,
  symbol: string,
  data: ConvertToPositionInput,
): Promise<void> => {
  const normalizedSymbol = symbol.toUpperCase()

  const entry = await prisma.watchlist.findUnique({
    where: { userId_symbol: { userId, symbol: normalizedSymbol } },
  })
  if (!entry) {
    throw new AppError(`${normalizedSymbol} not found in your watchlist`, 404)
  }

  const priceData = await getCurrentPrice(normalizedSymbol)
  const defaultEntryPrice = priceData?.price || entry.targetEntryPrice || 0
  if (defaultEntryPrice <= 0 && !data.entryPrice) {
    throw new AppError(
      `Could not determine entry price for ${normalizedSymbol}. Please provide an entry price.`,
      400,
    )
  }

  await prisma.$transaction(async (tx) => {
    let portfolio = await tx.portfolio.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    if (!portfolio) {
      throw new AppError(
        'No portfolio is uploaded in Portfolio Health. Please upload your portfolio CSV/Excel first.',
        400,
      )
    }

    const quantity = data.quantity ?? 1
    const avgEntryPrice = data.entryPrice ?? defaultEntryPrice

    const existingPosition = await tx.position.findFirst({
      where: { portfolioId: portfolio.id, symbol: normalizedSymbol },
    })

    if (existingPosition) {
      const totalQuantity = existingPosition.quantity + quantity
      const newAvgPrice =
        (existingPosition.avgEntryPrice * existingPosition.quantity +
          avgEntryPrice * quantity) /
        totalQuantity

      await tx.position.update({
        where: { id: existingPosition.id },
        data: {
          quantity: totalQuantity,
          avgEntryPrice: newAvgPrice,
        },
      })
    } else {
      await tx.position.create({
        data: {
          portfolioId: portfolio.id,
          symbol: normalizedSymbol,
          quantity,
          avgEntryPrice,
        },
      })
    }

    await tx.watchlist.delete({
      where: { userId_symbol: { userId, symbol: normalizedSymbol } },
    })
  })

  invalidateUserPortfolioFitCache(userId)
}

export const createAlert = async (
  userId: string,
  symbol: string,
  data: CreateAlertInput,
) => {
  const normalizedSymbol = symbol.toUpperCase()

  const watchlistEntry = await prisma.watchlist.findUnique({
    where: { userId_symbol: { userId, symbol: normalizedSymbol } },
  })
  if (!watchlistEntry) {
    throw new AppError(`${normalizedSymbol} not found in your watchlist`, 404)
  }

  const alert = await prisma.watchlistAlert.create({
    data: {
      watchlistId: watchlistEntry.id,
      userId,
      type: data.type,
      threshold: data.threshold ?? null,
      isActive: true,
    },
  })

  invalidateAlertCache(normalizedSymbol)

  return alert
}

// ── UPDATE Operations ──
export const updateWatchlistEntry = async (
  userId: string,
  symbol: string,
  data: UpdateWatchlistInput,
): Promise<WatchlistItemResponse> => {
  const normalizedSymbol = symbol.toUpperCase()

  const entry = await prisma.watchlist.findUnique({
    where: { userId_symbol: { userId, symbol: normalizedSymbol } },
  })
  if (!entry) {
    throw new AppError(`${normalizedSymbol} not found in your watchlist`, 404)
  }

  const updated = await prisma.watchlist.update({
    where: { userId_symbol: { userId, symbol: normalizedSymbol } },
    data: {
      ...(data.targetEntryPrice !== undefined && {
        targetEntryPrice: data.targetEntryPrice,
      }),
      ...(data.stopLoss !== undefined && { stopLoss: data.stopLoss }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  })

  const item = formatWatchlistItem(updated)

  item.logo = await getCompanyLogo(updated.symbol)
  const priceData = await getCurrentPrice(updated.symbol)

  if (priceData) {
    item.currentPrice = priceData.price
    item.changePercent = priceData.changePercent

    const price = priceData.price

    item.entryZone =
      updated.targetEntryPrice !== null
        ? price <= updated.targetEntryPrice * 1.02
        : null

    item.stopLossBreached =
      updated.stopLoss !== null ? price <= updated.stopLoss : null

    item.priceSinceAdded =
      updated.priceAtCreatedAt !== null
        ? ((price - updated.priceAtCreatedAt) / updated.priceAtCreatedAt) * 100
        : null

    item.portfolioFit = await getPortfolioFit(userId, updated.symbol, price)
  }

  return item
}

export const updateAlert = async (
  userId: string,
  symbol: string,
  alertId: string,
  data: UpdateAlertInput,
) => {
  const normalizedSymbol = symbol.toUpperCase()

  const alert = await prisma.watchlistAlert.findFirst({
    where: { id: alertId, userId },
    include: { watchlist: true },
  })
  if (alert?.watchlist.symbol !== normalizedSymbol) {
    throw new AppError('Alert not found', 404)
  }

  const updated = await prisma.watchlistAlert.update({
    where: { id: alertId },
    data: {
      ...(data.threshold !== undefined && { threshold: data.threshold }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  })

  invalidateAlertCache(normalizedSymbol)

  return updated
}

// ── DELETE Operations ──
export const removeFromWatchlist = async (
  userId: string,
  symbol: string,
): Promise<void> => {
  const normalizedSymbol = symbol.toUpperCase()

  const entry = await prisma.watchlist.findUnique({
    where: { userId_symbol: { userId, symbol: normalizedSymbol } },
  })
  if (!entry) {
    throw new AppError(`${normalizedSymbol} not found in your watchlist`, 404)
  }

  await prisma.watchlist.delete({
    where: { userId_symbol: { userId, symbol: normalizedSymbol } },
  })

  const remainingWatchers = await prisma.watchlist.count({
    where: { symbol: normalizedSymbol },
  })
  if (remainingWatchers === 0) {
    finnhubService.unsubscribe(normalizedSymbol)
  }

  evictPortfolioFitEntry(userId, normalizedSymbol)
}

export const deleteAlert = async (
  userId: string,
  symbol: string,
  alertId: string,
): Promise<void> => {
  const normalizedSymbol = symbol.toUpperCase()

  const alert = await prisma.watchlistAlert.findFirst({
    where: { id: alertId, userId },
    include: { watchlist: true },
  })
  if (alert?.watchlist.symbol !== normalizedSymbol) {
    throw new AppError('Alert not found', 404)
  }

  await prisma.watchlistAlert.delete({ where: { id: alertId } })

  invalidateAlertCache(normalizedSymbol)
}
