import type { WatchlistAlert } from '@prisma/client'
import { prisma } from '../../../shared/infrastructure/database'
import { logger } from '../../../shared/infrastructure/logger'
import { priceCache } from '../../market'
import { dispatchNotification } from '../../notifications'
import { getActiveAlertsForSymbol } from '../caches/alert-rule-cache'
import type { WatchlistPriceLevels } from '../types'

const COOLDOWN_MS = 60 * 60 * 1000 // 1 hour per spec §9

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Cooldown Check ───────────────────────────────────────────────────────────

/**
 * Returns true if this alert has already fired within the 1-hour cooldown window.
 * One indexed DB read per alert — AlertLog has an index on alertId.
 */
const isInCooldown = async (alertId: string): Promise<boolean> => {
  const lastLog = await prisma.alertLog.findFirst({
    where: { alertId },
    orderBy: { firedAt: 'desc' },
  })
  if (!lastLog) return false
  return Date.now() - lastLog.firedAt.getTime() < COOLDOWN_MS
}

// ─── Pure Rule Evaluator ─────────────────────────────────────────────────────

/**
 * Compare a value against a nullable numeric threshold.
 * Returns false when the threshold is null/undefined; otherwise evaluates `cmp`.
 * Keeps the rule switch free of per-case null-guard nesting.
 */
const compareGte = (
  value: number,
  threshold: number | null | undefined,
): boolean =>
  threshold !== null && threshold !== undefined && value >= threshold

const compareLte = (
  value: number,
  threshold: number | null | undefined,
): boolean =>
  threshold !== null && threshold !== undefined && value <= threshold

/**
 * Evaluate a single alert rule against the current tick.
 * Pure function — no DB reads, no side effects, returns boolean only.
 *
 * AI_SIGNAL_CHANGED and event-based types (EARNINGS, DIVIDEND, etc.)
 * are evaluated by cron jobs in M8, never by the tick handler.
 */
const evaluateRule = (
  alert: WatchlistAlert,
  currentPrice: number,
  changePercent: number,
  levels: WatchlistPriceLevels,
): boolean => {
  switch (alert.type) {
    case 'PRICE_ABOVE':
      return compareGte(currentPrice, alert.threshold)
    case 'PRICE_BELOW':
      return compareLte(currentPrice, alert.threshold)
    case 'PCT_CHANGE_UP':
      return compareGte(changePercent, alert.threshold)
    case 'PCT_CHANGE_DOWN':
      return alert.threshold !== null && alert.threshold !== undefined
        ? changePercent <= -alert.threshold
        : false
    case 'ENTRY_ZONE':
      return levels.targetEntryPrice !== null
        ? currentPrice <= levels.targetEntryPrice * 1.02
        : false
    case 'STOP_LOSS_BREACHED':
      return compareLte(currentPrice, levels.stopLoss)

    // Evaluated by cron/AI jobs in M8 — never by the tick handler
    case 'EARNINGS_APPROACHING':
    case 'DIVIDEND_APPROACHING':
    case 'ANALYST_RATING_CHANGE':
    case 'NEWS_PUBLISHED':
    case 'SEC_FILING':
    case 'AI_SIGNAL_CHANGED':
      return false

    default:
      return false
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Called on every incoming trade tick from the Finnhub WebSocket.
 *
 * Flow:
 *   1. Load all active alerts for this symbol from DB (with watchlist price levels)
 *   2. Read changePercent for this symbol from priceCache (set by REST quote)
 *   3. For each alert — evaluate rule, check cooldown, write AlertLog, dispatch notification
 *
 * Must NEVER throw — all errors caught and logged so the tick pipeline
 * is never interrupted (spec §10).
 */
export const evaluateAlertsForTick = async (
  symbol: string,
  currentPrice: number,
): Promise<void> => {
  try {
    // ── 1. Load active alerts for this symbol ──────────────────────────────
    // Include watchlist price levels so ENTRY_ZONE and STOP_LOSS_BREACHED
    // can be evaluated without additional queries per alert.
    const cachedAlerts = await getActiveAlertsForSymbol(symbol)
    if (cachedAlerts.length === 0) return

    // Full DB query only runs when the cache confirms at least one active alert
    // exists for this symbol. Includes watchlist price levels needed for
    // ENTRY_ZONE and STOP_LOSS_BREACHED evaluation.
    const alerts = await prisma.watchlistAlert.findMany({
      where: {
        id: { in: cachedAlerts.map((a) => a.id) },
        isActive: true,
      },
      include: {
        watchlist: {
          select: {
            targetEntryPrice: true,
            stopLoss: true,
          },
        },
      },
    })

    if (alerts.length === 0) return

    // ── 2. changePercent for PCT_CHANGE rules ──────────────────────────────
    // priceCache is keyed by symbol — populated by REST quote on subscribe
    // and kept current by periodic REST fallback on GET /watchlist.
    const changePercent = priceCache.get(symbol)?.changePercent ?? 0

    // ── 3. Evaluate each alert rule ────────────────────────────────────────
    await Promise.all(
      alerts.map(async (alert) => {
        const levels: WatchlistPriceLevels = {
          targetEntryPrice: alert.watchlist.targetEntryPrice,
          stopLoss: alert.watchlist.stopLoss,
        }

        const triggered = evaluateRule(
          alert,
          currentPrice,
          changePercent,
          levels,
        )
        if (!triggered) return

        // Cooldown — suppress re-fire within 1 hour per rule
        const inCooldown = await isInCooldown(alert.id)
        if (inCooldown) return

        // Write AlertLog first — this is the deduplication anchor.
        // If notification dispatch fails, the log row still prevents
        // a duplicate fire on the next tick.
        await prisma.alertLog.create({ data: { alertId: alert.id } })

        // Dispatch in-app notification — errors logged, never rethrown
        await dispatchNotification(
          alert.userId,
          symbol,
          alert.type,
          currentPrice,
          alert.threshold,
        ).catch((err) =>
          logger.error(
            `[AlertEvaluator] Notification dispatch failed for alert ${alert.id}`,
            err,
          ),
        )
      }),
    )
  } catch (err) {
    // Catch-all — the tick pipeline must never crash due to alert evaluation
    logger.error(`[AlertEvaluator] Uncaught error for ${symbol}`, err)
  }
}
