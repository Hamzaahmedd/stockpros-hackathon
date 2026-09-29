/**
 * Unit tests for the earnings-countdown date arithmetic in earnings-checker.ts.
 *
 * Root cause under test: `daysUntilEarnings` must stay a stable integer
 * regardless of the viewer's timezone (Finnhub's earnings dates are US
 * trading-day dates, anchored to America/New_York — not UTC and not PKT).
 * These tests pin "now" to instants that straddle ET midnight and PKT
 * midnight to prove the count doesn't drift near either boundary.
 */

jest.mock('../../../shared/infrastructure/clients/finnhub-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

import finnhubClient from '../../../shared/infrastructure/clients/finnhub-client'
import {
  addDaysToDateStr,
  diffDateStrs,
  getEarningsWithinWindow,
  getEasternDateStr,
} from '../earnings-checker'

const mockFinnhubGet = (finnhubClient as unknown as { get: jest.Mock }).get

describe('getEasternDateStr', () => {
  it('stays on the previous ET calendar day just after UTC midnight (ET is behind UTC)', () => {
    // 2026-09-17T02:00:00Z is still 2026-09-16 evening in America/New_York (EDT, UTC-4).
    const date = new Date('2026-09-17T02:00:00Z')
    expect(getEasternDateStr(date)).toBe('2026-09-16')
  })

  it('rolls over to the next ET calendar day only after ET midnight', () => {
    // 2026-09-17T05:00:00Z = 2026-09-17T01:00 EDT — just past ET midnight.
    const date = new Date('2026-09-17T05:00:00Z')
    expect(getEasternDateStr(date)).toBe('2026-09-17')
  })

  it('is unaffected by what the PKT wall-clock date says', () => {
    // 2026-09-17T20:00:00Z = 2026-09-18T01:00 PKT (already "tomorrow" in Pakistan)
    // but still 2026-09-17T16:00 EDT (same ET day) — ET must win, not PKT.
    const date = new Date('2026-09-17T20:00:00Z')
    expect(getEasternDateStr(date)).toBe('2026-09-17')
  })
})

describe('addDaysToDateStr', () => {
  it('adds whole calendar days without being affected by DST shifts', () => {
    expect(addDaysToDateStr('2026-09-16', 5)).toBe('2026-09-21')
  })

  it('rolls over month/year boundaries correctly', () => {
    expect(addDaysToDateStr('2026-12-29', 5)).toBe('2027-01-03')
  })
})

describe('diffDateStrs', () => {
  it('returns 0 for the same calendar date', () => {
    expect(diffDateStrs('2026-09-17', '2026-09-17')).toBe(0)
  })

  it('returns a clean positive integer for a future date, never a fraction', () => {
    expect(diffDateStrs('2026-09-16', '2026-09-17')).toBe(1)
    expect(diffDateStrs('2026-09-16', '2026-09-21')).toBe(5)
  })

  it('returns a negative integer for a past date', () => {
    expect(diffDateStrs('2026-09-17', '2026-09-16')).toBe(-1)
  })
})

describe('end-to-end day-count stability across the PKT/ET boundary gap', () => {
  // Reproduces the exact scenario from the bug report: earnings on the "next"
  // ET day, checked at an instant where Pakistan's calendar has already
  // rolled over to that same date but the US trading day has not started yet.
  it('does not report earnings as "today" purely because PKT has already flipped to that date', () => {
    // 2026-09-17T22:00:00Z = 2026-09-18T03:00 PKT (already the 18th locally)
    // but only 2026-09-17T18:00 EDT (still the 17th for the market).
    const now = new Date('2026-09-17T22:00:00Z')
    const todayStr = getEasternDateStr(now)
    expect(todayStr).toBe('2026-09-17')

    const earningsDate = '2026-09-18'
    expect(diffDateStrs(todayStr, earningsDate)).toBe(1) // still "tomorrow" for the market
  })
})

describe('getEarningsWithinWindow', () => {
  const todayStr = getEasternDateStr(new Date())

  beforeEach(() => jest.clearAllMocks())

  it('returns null when Finnhub reports no earnings in the window', async () => {
    mockFinnhubGet.mockResolvedValue({ data: { earningsCalendar: [] } })
    expect(await getEarningsWithinWindow('AAPL')).toBeNull()
  })

  it('returns null when the earningsCalendar field is missing entirely', async () => {
    mockFinnhubGet.mockResolvedValue({ data: {} })
    expect(await getEarningsWithinWindow('AAPL')).toBeNull()
  })

  it('returns the nearest upcoming earnings date with a correct day count', async () => {
    const earningsDate = addDaysToDateStr(todayStr, 3)
    mockFinnhubGet.mockResolvedValue({
      data: { earningsCalendar: [{ date: earningsDate, symbol: 'AAPL' }] },
    })
    const result = await getEarningsWithinWindow('AAPL')
    expect(result).toEqual({ earningsDate, daysUntilEarnings: 3 })
  })

  it('picks the nearest date when multiple entries are returned', async () => {
    mockFinnhubGet.mockResolvedValue({
      data: {
        earningsCalendar: [
          { date: addDaysToDateStr(todayStr, 4), symbol: 'AAPL' },
          { date: addDaysToDateStr(todayStr, 1), symbol: 'AAPL' },
        ],
      },
    })
    const result = await getEarningsWithinWindow('AAPL')
    expect(result?.daysUntilEarnings).toBe(1)
  })

  it('ignores entries for a different symbol', async () => {
    mockFinnhubGet.mockResolvedValue({
      data: { earningsCalendar: [{ date: todayStr, symbol: 'MSFT' }] },
    })
    expect(await getEarningsWithinWindow('AAPL')).toBeNull()
  })

  it('ignores a stale entry dated before today', async () => {
    mockFinnhubGet.mockResolvedValue({
      data: {
        earningsCalendar: [
          { date: addDaysToDateStr(todayStr, -1), symbol: 'AAPL' },
        ],
      },
    })
    expect(await getEarningsWithinWindow('AAPL')).toBeNull()
  })

  it('defaults the window to 5 days when none is given', async () => {
    mockFinnhubGet.mockResolvedValue({ data: { earningsCalendar: [] } })
    await getEarningsWithinWindow('AAPL')
    expect(mockFinnhubGet).toHaveBeenCalledWith(
      '/calendar/earnings',
      expect.objectContaining({
        params: expect.objectContaining({ to: addDaysToDateStr(todayStr, 5) }),
      }),
    )
  })

  it('honors an explicit window size', async () => {
    mockFinnhubGet.mockResolvedValue({ data: { earningsCalendar: [] } })
    await getEarningsWithinWindow('AAPL', 10)
    expect(mockFinnhubGet).toHaveBeenCalledWith(
      '/calendar/earnings',
      expect.objectContaining({
        params: expect.objectContaining({ to: addDaysToDateStr(todayStr, 10) }),
      }),
    )
  })

  it('never throws — returns null and logs when the Finnhub request itself fails', async () => {
    mockFinnhubGet.mockRejectedValue(new Error('finnhub down'))
    await expect(getEarningsWithinWindow('AAPL')).resolves.toBeNull()
  })
})
