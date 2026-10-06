import { describe, expect, it } from 'vitest'
import { daysUntil, formatChartDay } from './utils'

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
