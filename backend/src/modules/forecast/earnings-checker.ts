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
    // Finnhub's earnings calendar dates are US trading-day dates (anchored to
    // America/New_York), not UTC or the viewer's local time. All "today"/window
    // arithmetic here must use that same calendar-date frame, or the day-count
    // silently drifts near midnight for viewers in other timezones (e.g. PKT).
    const todayStr = getEasternDateStr(new Date())
    const windowEndStr = addDaysToDateStr(todayStr, windowDays)

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

    // Both sides are plain YYYY-MM-DD calendar dates now, so the diff is an
    // exact integer — no fractional days from mixing a date with an instant.
    const daysUntil = diffDateStrs(todayStr, nearest.date)

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

/** Formats `date` as a YYYY-MM-DD calendar date in America/New_York. */
export function getEasternDateStr(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function parseDateStr(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const ms = parseDateStr(dateStr) + days * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString().split('T')[0]
}

/** Whole calendar days from `fromStr` to `toStr` (both YYYY-MM-DD). */
export function diffDateStrs(fromStr: string, toStr: string): number {
  return Math.round(
    (parseDateStr(toStr) - parseDateStr(fromStr)) / (24 * 60 * 60 * 1000),
  )
}
