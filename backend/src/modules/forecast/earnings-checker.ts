/**
 * Earnings Shock Checker
 *
 * Queries Finnhub's earnings calendar for a given symbol and determines
 * whether a scheduled earnings release falls within the forecast window.
 *
 * Used by the forecast service to apply the Earnings Shock Overlay:
 * – ATR multiplier expands to 2.5 * sqrt(t/5) to account for gap risk
 * – Confidence is forced to LOW
 * – earningsWarning flag is appended to the response payload
 */

import finnhubClient from '../../shared/infrastructure/clients/finnhub-client'
import { logger } from '../../shared/infrastructure/logger'

export interface EarningsHit {
  earningsDate: string
  daysUntilEarnings: number
}

interface FinnhubEarningsEntry {
  date: string
  symbol: string
  epsEstimate?: number | null
  revenueEstimate?: number | null
}

/**
 * Fetch the nearest upcoming earnings date for `symbol` within `windowDays`.
 *
 * @param symbol   - Ticker symbol (e.g. "AAPL")
 * @param windowDays - How many calendar days ahead to look (default: 5)
 * @returns EarningsHit if earnings fall in the window, null otherwise.
 *          Always resolves — never throws. Failures are logged and swallowed
 *          so a Finnhub outage never breaks the forecast response.
 */
export async function getEarningsWithinWindow(
  symbol: string,
  windowDays = 5,
): Promise<EarningsHit | null> {
  try {
    const today = new Date()
    const todayStr = formatDate(today)

    const windowEnd = new Date(today)
    windowEnd.setDate(windowEnd.getDate() + windowDays)
    const windowEndStr = formatDate(windowEnd)

    const response = await finnhubClient.get<{
      earningsCalendar: FinnhubEarningsEntry[]
    }>('/calendar/earnings', {
      params: { from: todayStr, to: windowEndStr, symbol },
    })

    const entries: FinnhubEarningsEntry[] =
      response.data?.earningsCalendar ?? []

    if (entries.length === 0) return null

    // Sort ascending by date and take the nearest
    const sorted = entries
      .filter((e) => e.symbol === symbol && e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))

    const nearest = sorted[0]
    if (!nearest) return null

    const earningsDateObj = new Date(nearest.date)
    const daysUntil = Math.ceil(
      (earningsDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    )

    logger.info(
      `[EarningsChecker] ${symbol}: earnings on ${nearest.date} (${daysUntil}d away)`,
    )

    return { earningsDate: nearest.date, daysUntilEarnings: daysUntil }
  } catch (err) {
    logger.warn(
      `[EarningsChecker] Failed to fetch earnings for ${symbol}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return null
  }
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}
