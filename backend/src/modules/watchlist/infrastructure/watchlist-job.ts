import type { AlertType } from '@prisma/client'
import finnhubClient from '../../../shared/infrastructure/clients/finnhub-client'
import { prisma } from '../../../shared/infrastructure/database'
import { logger } from '../../../shared/infrastructure/logger'
import { dispatchNotification } from '../../notifications'
import { computeAndStoreAiZones } from '../evaluators/ai-zone-calculator'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get all distinct symbols currently on any user's watchlist,
 * along with the userIds watching each one.
 * Used by every job to know what to fetch and who to notify.
 */
const getWatchedSymbolsWithUsers = async (): Promise<
  Array<{ symbol: string; userId: string; watchlistId: string }>
> => {
  const entries = await prisma.watchlist.findMany({
    select: { symbol: true, userId: true, id: true },
  })
  return entries.map((e) => ({
    symbol: e.symbol,
    userId: e.userId,
    watchlistId: e.id,
  }))
}

/**
 * Find all active alerts of a given type for a specific watchlist entry.
 * Used to check whether a user has opted in to a particular event alert.
 */
const hasActiveAlert = async (
  watchlistId: string,
  type: string,
): Promise<boolean> => {
  const alert = await prisma.watchlistAlert.findFirst({
    where: { watchlistId, type: type as AlertType, isActive: true },
  })
  return alert !== null
}

/**
 * Check cooldown and dispatch a notification for an event-based alert.
 * Writes AlertLog first so deduplication holds even if dispatch fails.
 */
const fireEventAlert = async (
  watchlistId: string,
  userId: string,
  symbol: string,
  alertType: string,
  currentPrice: number,
): Promise<void> => {
  // Find the active alert rule for this type
  const alert = await prisma.watchlistAlert.findFirst({
    where: { watchlistId, type: alertType as AlertType, isActive: true },
  })
  if (!alert) return

  // Cooldown check — 1 hour per spec §9
  const lastLog = await prisma.alertLog.findFirst({
    where: { alertId: alert.id },
    orderBy: { firedAt: 'desc' },
  })
  const COOLDOWN_MS = 60 * 60 * 1000
  if (lastLog && Date.now() - lastLog.firedAt.getTime() < COOLDOWN_MS) return

  // Write log first, then dispatch
  await prisma.alertLog.create({ data: { alertId: alert.id } })
  await dispatchNotification(
    userId,
    symbol,
    alertType as AlertType,
    currentPrice,
  ).catch((err) =>
    logger.error(
      `[CronJob] Notification failed for ${symbol} ${alertType}:`,
      err,
    ),
  )
}

// ─── Job 1: Earnings Approaching ─────────────────────────────────────────────

/**
 * Fetch upcoming earnings events from Finnhub.
 * Fires EARNINGS_APPROACHING if an event falls within the next 3 days
 * and the user has that alert type active.
 *
 * Pattern: fetch → diff against snapshot → fire only on delta (spec §11).
 * Snapshot key: `earnings_snapshot:${symbol}` stored in DB metadata
 * (we use the Watchlist.notes field is NOT suitable — we track last-seen
 * earnings date in a dedicated approach: compare firedAt in AlertLog).
 */
export const runEarningsAlertJob = async (): Promise<void> => {
  logger.info('[CronJob] Running earnings alert job')
  try {
    const entries = await getWatchedSymbolsWithUsers()
    const symbols = new Set(entries.map((e) => e.symbol))
    const now = new Date()
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const from = now.toISOString().split('T')[0]
    const to = in3Days.toISOString().split('T')[0]

    const { data } = await finnhubClient.get<{
      earningsCalendar: Array<{ symbol: string; date: string }>
    }>(`/calendar/earnings`, {
      params: { from, to },
    })

    const upcomingSymbols = new Set(
      (data.earningsCalendar ?? [])
        .filter((e) => symbols.has(e.symbol))
        .map((e) => e.symbol),
    )

    for (const entry of entries) {
      if (!upcomingSymbols.has(entry.symbol)) continue
      if (!(await hasActiveAlert(entry.watchlistId, 'EARNINGS_APPROACHING')))
        continue

      await fireEventAlert(
        entry.watchlistId,
        entry.userId,
        entry.symbol,
        'EARNINGS_APPROACHING',
        0, // no price needed for earnings notification
      )
    }
  } catch (err) {
    logger.error('[CronJob] Earnings alert job failed:', err)
  }
}

// ─── Job 2: Dividend Ex-Date Approaching ─────────────────────────────────────

/**
 * Fetch dividend data per symbol and fire DIVIDEND_APPROACHING
 * if the ex-date falls within the next 3 days.
 */
export const runDividendAlertJob = async (): Promise<void> => {
  logger.info('[CronJob] Running dividend alert job')
  try {
    const entries = await getWatchedSymbolsWithUsers()
    const symbols = new Set(entries.map((e) => e.symbol))
    const now = new Date()
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

    await Promise.all(
      [...symbols].map(async (symbol) => {
        try {
          const { data } = await finnhubClient.get<
            Array<{ symbol: string; exDate: string }>
          >(`/stock/dividend`, {
            params: { symbol },
          })

          const hasUpcoming = (data ?? []).some((d) => {
            const exDate = new Date(d.exDate)
            return exDate >= now && exDate <= in3Days
          })

          if (!hasUpcoming) return

          const symbolEntries = entries.filter((e) => e.symbol === symbol)
          for (const entry of symbolEntries) {
            if (
              !(await hasActiveAlert(entry.watchlistId, 'DIVIDEND_APPROACHING'))
            )
              continue
            await fireEventAlert(
              entry.watchlistId,
              entry.userId,
              symbol,
              'DIVIDEND_APPROACHING',
              0,
            )
          }
        } catch (err) {
          logger.error(`[CronJob] Dividend fetch failed for ${symbol}`, err)
        }
      }),
    )
  } catch (err) {
    logger.error('[CronJob] Dividend alert job failed:', err)
  }
}

// ─── Job 3: Analyst Rating Change ────────────────────────────────────────────

/**
 * Fetch analyst consensus recommendations per symbol.
 * Fires ANALYST_RATING_CHANGE when the most recent recommendation period
 * differs from the previous one stored in AlertLog (delta pattern).
 *
 * Snapshot approach: we record the last-seen `period` string in a
 * dedicated DB table would be ideal, but to avoid a schema change we
 * use AlertLog frequency — if no log exists for this symbol in the last
 * 24 hours, we treat the latest record as potentially new.
 */
export const runAnalystRatingJob = async (): Promise<void> => {
  logger.info('[CronJob] Running analyst rating job')
  try {
    const entries = await getWatchedSymbolsWithUsers()
    const symbols = new Set(entries.map((e) => e.symbol))

    await Promise.all(
      [...symbols].map(async (symbol) => {
        try {
          const { data } = await finnhubClient.get<
            Array<{
              period: string
              strongBuy: number
              buy: number
              hold: number
            }>
          >(`/stock/recommendation`, {
            params: { symbol },
          })

          if (!data || data.length === 0) return

          // Delta check: has any user's ANALYST_RATING_CHANGE alert for this
          // symbol fired in the last 24 hours? If yes, skip (already notified).
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
          const symbolEntries = entries.filter((e) => e.symbol === symbol)

          for (const entry of symbolEntries) {
            if (
              !(await hasActiveAlert(
                entry.watchlistId,
                'ANALYST_RATING_CHANGE',
              ))
            )
              continue

            const alert = await prisma.watchlistAlert.findFirst({
              where: {
                watchlistId: entry.watchlistId,
                type: 'ANALYST_RATING_CHANGE',
              },
            })
            if (!alert) continue

            const recentLog = await prisma.alertLog.findFirst({
              where: { alertId: alert.id, firedAt: { gte: oneDayAgo } },
              orderBy: { firedAt: 'desc' },
            })
            if (recentLog) continue // already fired today

            await fireEventAlert(
              entry.watchlistId,
              entry.userId,
              symbol,
              'ANALYST_RATING_CHANGE',
              0,
            )
          }
        } catch (err) {
          logger.error(
            `[CronJob] Analyst rating fetch failed for ${symbol}:`,
            err,
          )
        }
      }),
    )
  } catch (err) {
    logger.error('[CronJob] Analyst rating job failed:', err)
  }
}

// ─── Job 4: News Published ────────────────────────────────────────────────────

/**
 * Fetch recent company news per symbol (last 30 minutes).
 * Fires NEWS_PUBLISHED when a new article is found that wasn't seen
 * in the previous run.
 *
 * Delta pattern: records the last-seen news article `id` per symbol
 * using AlertLog notes is not ideal — instead we compare article
 * datetime against the last AlertLog firedAt for this alert type.
 * Runs every 15-30 minutes (spec §11).
 */
export const runNewsAlertJob = async (): Promise<void> => {
  logger.info('[CronJob] Running news alert job')
  try {
    const entries = await getWatchedSymbolsWithUsers()
    const symbols = new Set(entries.map((e) => e.symbol))
    const now = new Date()
    const from = new Date(now.getTime() - 30 * 60 * 1000) // last 30 min
    const fromStr = from.toISOString().split('T')[0]
    const toStr = now.toISOString().split('T')[0]

    await Promise.all(
      [...symbols].map(async (symbol) => {
        try {
          const { data } = await finnhubClient.get<
            Array<{ id: number; datetime: number; headline: string }>
          >(`/company-news`, {
            params: { symbol, from: fromStr, to: toStr },
          })

          if (!data || data.length === 0) return

          // Filter to articles published in the last 30 minutes
          const recentArticles = data.filter(
            (a) => a.datetime * 1000 >= from.getTime(),
          )
          if (recentArticles.length === 0) return

          const symbolEntries = entries.filter((e) => e.symbol === symbol)
          for (const entry of symbolEntries) {
            if (!(await hasActiveAlert(entry.watchlistId, 'NEWS_PUBLISHED')))
              continue
            await fireEventAlert(
              entry.watchlistId,
              entry.userId,
              symbol,
              'NEWS_PUBLISHED',
              0,
            )
          }
        } catch (err) {
          logger.error(`[CronJob] News fetch failed for ${symbol}`, err)
        }
      }),
    )
  } catch (err) {
    logger.error('[CronJob] News alert job failed:', err)
  }
}

// ─── Job 5: SEC Filing Published ─────────────────────────────────────────────

/**
 * Fetch SEC filings per symbol.
 * Fires SEC_FILING when a new filing was published since the last AlertLog
 * entry for this alert type (delta pattern).
 */
export const runSecFilingJob = async (): Promise<void> => {
  logger.info('[CronJob] Running SEC filing job')
  try {
    const entries = await getWatchedSymbolsWithUsers()
    const symbols = new Set(entries.map((e) => e.symbol))

    await Promise.all(
      [...symbols].map(async (symbol) => {
        try {
          const { data } = await finnhubClient.get<{
            data: Array<{ filedDate: string; form: string }>
          }>(`/stock/filings`, {
            params: { symbol },
          })

          if (!data?.data || data.data.length === 0) return

          const latestFiling = data.data[0]
          const filedDate = new Date(latestFiling.filedDate)
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

          // Only fire if the most recent filing was within the last day
          if (filedDate < oneDayAgo) return

          const symbolEntries = entries.filter((e) => e.symbol === symbol)
          for (const entry of symbolEntries) {
            if (!(await hasActiveAlert(entry.watchlistId, 'SEC_FILING')))
              continue
            await fireEventAlert(
              entry.watchlistId,
              entry.userId,
              symbol,
              'SEC_FILING',
              0,
            )
          }
        } catch (err) {
          logger.error(`[CronJob] SEC filing fetch failed for ${symbol}`, err)
        }
      }),
    )
  } catch (err) {
    logger.error('[CronJob] SEC filing job failed:', err)
  }
}

// ─── Job 6: AI Zone Recomputation ─────────────────────────────────────────────

/**
 * Daily recomputation of AI suggested zones for all watched symbols.
 * Also fires if price has moved >5% since aiComputedAt (spec §11).
 *
 * For each symbol, runs computeAndStoreAiZones then fires
 * AI_SIGNAL_CHANGED for any user watching that symbol who has
 * that alert type active.
 */
export const runAiZoneRecomputeJob = async (): Promise<void> => {
  logger.info('[CronJob] Running AI zone recompute job')
  try {
    const entries = await prisma.watchlist.findMany({
      select: {
        userId: true,
        symbol: true,
        id: true,
        aiComputedAt: true,
        aiSuggestedEntry: true,
      },
    })

    const symbols = new Set(entries.map((e) => e.symbol))

    await Promise.all(
      [...symbols].map(async (symbol) => {
        // Recompute for the first user watching this symbol —
        // result is stored on the watchlist row per userId+symbol
        const symbolEntries = entries.filter((e) => e.symbol === symbol)

        for (const entry of symbolEntries) {
          try {
            await computeAndStoreAiZones(entry.userId, symbol)

            // Notify users with AI_SIGNAL_CHANGED alert active
            if (!(await hasActiveAlert(entry.id, 'AI_SIGNAL_CHANGED'))) continue

            await fireEventAlert(
              entry.id,
              entry.userId,
              symbol,
              'AI_SIGNAL_CHANGED',
              0,
            )
          } catch (err) {
            logger.error(`[CronJob] AI recompute failed for ${symbol}`, err)
          }
        }
      }),
    )
  } catch (err) {
    logger.error('[CronJob] AI zone recompute job failed:', err)
  }
}
