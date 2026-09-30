import config from '@/config'
import { logger } from '../infrastructure/logger'

/**
 * Every instant is converted to New York wall-clock time through
 * Intl.DateTimeFormat with this explicit IANA zone — never via getHours() or
 * other host-timezone APIs — so results are identical whatever the server's
 * TZ is, and EDT (UTC-4) / EST (UTC-5) shifts are handled by the tz database.
 */
const NEW_YORK_TIME_ZONE = 'America/New_York'

const SESSION_OPEN_MIN = 9 * 60 + 30
const REGULAR_CLOSE_MIN = 16 * 60
const EARLY_CLOSE_MIN = 13 * 60
/** Length of the volatility spike at the open and (before the close) at the end of the session. */
const SPIKE_LENGTH_MIN = 30

const WEEKDAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: NEW_YORK_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
})

interface EasternTime {
  year: number
  month: number // 1–12
  day: number
  weekday: string
  minutes: number // minutes since local midnight
}

const easternTime = (now: Date): EasternTime => {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(now).map((p) => [p.type, p.value]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

// ─── Holiday calendar ─────────────────────────────────────────────────────────
// All dates are plain calendar dates in New York, so they are computed with
// UTC arithmetic (no timezone or DST involved) and keyed as "YYYY-MM-DD".

const dateKey = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

const fromUtc = (d: Date): string =>
  dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())

const utcDate = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month - 1, day))

const dayOfWeek = (year: number, month: number, day: number): number =>
  utcDate(year, month, day).getUTCDay() // 0 = Sunday … 6 = Saturday

const addDays = (d: Date, days: number): Date =>
  new Date(d.getTime() + days * 24 * 60 * 60 * 1000)

/** The `n`-th (1-based) given weekday of a month, e.g. 3rd Monday of January. */
const nthWeekday = (
  year: number,
  month: number,
  weekday: number,
  n: number,
): Date => {
  const offset = (weekday - dayOfWeek(year, month, 1) + 7) % 7
  return utcDate(year, month, 1 + offset + (n - 1) * 7)
}

const lastWeekday = (year: number, month: number, weekday: number): Date => {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const offset = (dayOfWeek(year, month, lastDay) - weekday + 7) % 7
  return utcDate(year, month, lastDay - offset)
}

/** Gregorian Easter Sunday (anonymous / Meeus–Jones–Butcher algorithm). */
const easterSunday = (year: number): Date => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return utcDate(year, month, day)
}

/**
 * A fixed-date holiday's observed day: Saturday shifts back to Friday and
 * Sunday forward to Monday. `saturdayObserved` is false only for New Year's
 * Day, which NYSE does not move to the prior Friday (that would land in the
 * previous year's final trading day).
 */
const observed = (
  year: number,
  month: number,
  day: number,
  saturdayObserved = true,
): Date | null => {
  const dow = dayOfWeek(year, month, day)
  if (dow === 6) return saturdayObserved ? utcDate(year, month, day - 1) : null
  if (dow === 0) return utcDate(year, month, day + 1)
  return utcDate(year, month, day)
}

const JUNETEENTH_FIRST_OBSERVED_YEAR = 2022

const holidayCache = new Map<number, ReadonlySet<string>>()

/** Full-day NYSE closures for a calendar year, as "YYYY-MM-DD" keys. */
const nyseHolidays = (year: number): ReadonlySet<string> => {
  const cached = holidayCache.get(year)
  if (cached) return cached

  const dates: (Date | null)[] = [
    observed(year, 1, 1, false), // New Year's Day
    nthWeekday(year, 1, 1, 3), // Martin Luther King Jr. Day — 3rd Monday of January
    nthWeekday(year, 2, 1, 3), // Washington's Birthday — 3rd Monday of February
    addDays(easterSunday(year), -2), // Good Friday
    lastWeekday(year, 5, 1), // Memorial Day — last Monday of May
    year >= JUNETEENTH_FIRST_OBSERVED_YEAR ? observed(year, 6, 19) : null,
    observed(year, 7, 4), // Independence Day
    nthWeekday(year, 9, 1, 1), // Labor Day — 1st Monday of September
    nthWeekday(year, 11, 4, 4), // Thanksgiving — 4th Thursday of November
    observed(year, 12, 25), // Christmas Day
  ]

  const holidays = new Set(
    dates.filter((d): d is Date => d !== null).map(fromUtc),
  )
  holidayCache.set(year, holidays)
  return holidays
}

const isWeekday = (year: number, month: number, day: number): boolean => {
  const dow = dayOfWeek(year, month, day)
  return dow !== 0 && dow !== 6
}

/**
 * Trading days that close at 13:00 ET: the day after Thanksgiving, Christmas
 * Eve and July 3 — when they are ordinary weekday sessions.
 */
const isEarlyCloseDay = (year: number, month: number, day: number): boolean => {
  if (!isWeekday(year, month, day)) return false
  if (nyseHolidays(year).has(dateKey(year, month, day))) return false

  const dayAfterThanksgiving = addDays(nthWeekday(year, 11, 4, 4), 1)
  return (
    fromUtc(dayAfterThanksgiving) === dateKey(year, month, day) ||
    (month === 12 && day === 24) ||
    (month === 7 && day === 3)
  )
}

// ─── Emergency halt (runtime kill-switch) ────────────────────────────────────
// Seeded once from EMERGENCY_MARKET_CLOSED (config.market.emergencyClosed) and
// then held in memory, so it can be flipped at runtime — e.g. by an admin
// endpoint — without a restart. The state lives in this process's memory,
// which is all a single-instance deployment needs; it is lost on restart and
// falls back to the env-seeded value above.
let emergencyClosed = config.market.emergencyClosed

/** True while ops have declared the market closed regardless of the calendar. */
export const isEmergencyClosed = (): boolean => emergencyClosed

/** Turns the emergency halt on/off immediately; every change is logged for audit. */
export const setEmergencyClosed = (value: boolean): void => {
  if (value === emergencyClosed) return
  emergencyClosed = value
  logger.warn(
    `[MarketHours] Emergency market halt ${value ? 'ENABLED' : 'CLEARED'}`,
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** True when the date (in New York) is a full-day NYSE closure such as Thanksgiving or Good Friday. */
export const isNyseHoliday = (now: Date = new Date()): boolean => {
  const { year, month, day } = easternTime(now)
  return nyseHolidays(year).has(dateKey(year, month, day))
}

/** True during the regular NYSE session (always false while the emergency halt is on — see {@link isEmergencyClosed}): weekdays 09:30 to close (16:00, or 13:00 on early-close days), never on a holiday. */
export const isNyseMarketOpen = (now: Date = new Date()): boolean => {
  if (isEmergencyClosed()) return false
  const { year, month, day, weekday, minutes } = easternTime(now)
  if (!WEEKDAYS.has(weekday)) return false
  if (nyseHolidays(year).has(dateKey(year, month, day))) return false

  const closeMin = isEarlyCloseDay(year, month, day)
    ? EARLY_CLOSE_MIN
    : REGULAR_CLOSE_MIN
  return minutes >= SESSION_OPEN_MIN && minutes < closeMin
}

/**
 * True during the first and last 30 minutes of an open NYSE session (the
 * open/close volatility spikes). False whenever the market is closed —
 * weekends, holidays, and outside session hours.
 */
export const isMarketSpikeWindow = (now: Date = new Date()): boolean => {
  if (isEmergencyClosed()) return false
  if (!isNyseMarketOpen(now)) return false

  const { year, month, day, minutes } = easternTime(now)
  const closeMin = isEarlyCloseDay(year, month, day)
    ? EARLY_CLOSE_MIN
    : REGULAR_CLOSE_MIN
  return (
    minutes < SESSION_OPEN_MIN + SPIKE_LENGTH_MIN ||
    minutes >= closeMin - SPIKE_LENGTH_MIN
  )
}
