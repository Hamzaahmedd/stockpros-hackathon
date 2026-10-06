import { describe, expect, it } from 'vitest'
import { daysUntil, formatChartDay, parseRupeesToPaisa } from './utils'

describe('formatChartDay', () => {
  it('formats a calendar day without letting the runtime time zone shift it', () => {
    expect(formatChartDay('2026-10-06')).toBe('Oct 6')
    expect(formatChartDay('2026-01-01')).toBe('Jan 1')
  })
})

describe('daysUntil', () => {
  const now = new Date('2026-10-06T12:00:00Z')

  it('rounds a partial day up', () => {
    expect(daysUntil('2026-10-07T00:00:00Z', now)).toBe(1)
    expect(daysUntil('2026-10-16T12:00:00Z', now)).toBe(10)
  })

  it('never goes negative once the date has passed', () => {
    expect(daysUntil('2026-10-01T00:00:00Z', now)).toBe(0)
  })
})

describe('parseRupeesToPaisa', () => {
  const MIN = 5_000
  const MAX = 10_000_000

  it('converts rupees to whole paisa, rounding to the nearest paisa', () => {
    expect(parseRupeesToPaisa('500', MIN, MAX)).toBe(50_000)
    expect(parseRupeesToPaisa(' 50.50 ', MIN, MAX)).toBe(5_050)
    expect(parseRupeesToPaisa('0.1', 1, MAX)).toBe(10)
    expect(parseRupeesToPaisa('1234.567', MIN, MAX)).toBe(123_457)
  })

  it('accepts the bounds themselves', () => {
    expect(parseRupeesToPaisa('50', MIN, MAX)).toBe(MIN)
    expect(parseRupeesToPaisa('100000', MIN, MAX)).toBe(MAX)
  })

  it.each(['', '   ', 'abc', 'Infinity', '49.99', '100000.01', '-50'])(
    'returns null for %j',
    (value) => {
      expect(parseRupeesToPaisa(value, MIN, MAX)).toBeNull()
    },
  )
})
