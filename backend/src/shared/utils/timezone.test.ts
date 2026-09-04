/**
 * Unit tests for timezone utility functions.
 *
 * Strategy (Black-Box): We inject controlled Date objects and assert on the
 * numeric output. No internal Intl.DateTimeFormat calls are mocked.
 */
import {
  formatPakistanTimestamp,
  getPakistanGreeting,
  getPakistanHour,
  getPakistanMonth,
} from '../../shared/utils/timezone'

describe('getPakistanHour', () => {
  it('returns a number in the range [0, 23]', () => {
    const hour = getPakistanHour()
    expect(typeof hour).toBe('number')
    expect(hour).toBeGreaterThanOrEqual(0)
    expect(hour).toBeLessThanOrEqual(23)
  })

  it('interprets a UTC midnight date as hour 5 in PKT (UTC+5)', () => {
    // 2024-01-01T00:00:00Z → 05:00 PKT
    const utcMidnight = new Date('2024-01-01T00:00:00Z')
    expect(getPakistanHour(utcMidnight)).toBe(5)
  })

  it('interprets a UTC noon date as hour 17 in PKT (UTC+5)', () => {
    // 2024-01-01T12:00:00Z → 17:00 PKT
    const utcNoon = new Date('2024-01-01T12:00:00Z')
    expect(getPakistanHour(utcNoon)).toBe(17)
  })

  it('interprets 23:00 UTC as hour 4 (next day) in PKT', () => {
    // 2024-01-01T23:00:00Z → 04:00 PKT next day
    const utcLateNight = new Date('2024-01-01T23:00:00Z')
    expect(getPakistanHour(utcLateNight)).toBe(4)
  })
})

describe('getPakistanGreeting', () => {
  it('returns Good Morning before noon PKT', () => {
    // 04:00 UTC → 09:00 PKT
    expect(getPakistanGreeting(new Date('2024-01-01T04:00:00Z'))).toBe(
      'Good Morning',
    )
  })

  it('returns Good Afternoon from noon through 16:59 PKT', () => {
    // 07:00 UTC → 12:00 PKT
    expect(getPakistanGreeting(new Date('2024-01-01T07:00:00Z'))).toBe(
      'Good Afternoon',
    )
  })

  it('returns Good Evening from 17:00 PKT onward', () => {
    // 12:00 UTC → 17:00 PKT
    expect(getPakistanGreeting(new Date('2024-01-01T12:00:00Z'))).toBe(
      'Good Evening',
    )
  })
})

describe('formatPakistanTimestamp', () => {
  it('appends PKT and never GMT+5', () => {
    const formatted = formatPakistanTimestamp(
      new Date('2026-09-04T12:30:00Z'),
    )
    expect(formatted).toMatch(/PKT$/)
    expect(formatted).not.toContain('GMT')
  })
})

describe('getPakistanMonth', () => {
  it('returns a 0-indexed month number in the range [0, 11]', () => {
    const month = getPakistanMonth()
    expect(typeof month).toBe('number')
    expect(month).toBeGreaterThanOrEqual(0)
    expect(month).toBeLessThanOrEqual(11)
  })

  it('returns 0 (January) for a January date', () => {
    const jan = new Date('2024-01-15T10:00:00Z')
    expect(getPakistanMonth(jan)).toBe(0)
  })

  it('returns 11 (December) for a December date', () => {
    const dec = new Date('2024-12-15T10:00:00Z')
    expect(getPakistanMonth(dec)).toBe(11)
  })

  it('returns 2 (March) for a March date', () => {
    const mar = new Date('2024-03-10T06:00:00Z')
    expect(getPakistanMonth(mar)).toBe(2)
  })

  it('returns 5 (June) for a June date', () => {
    const jun = new Date('2024-06-01T10:00:00Z')
    expect(getPakistanMonth(jun)).toBe(5)
  })
})
