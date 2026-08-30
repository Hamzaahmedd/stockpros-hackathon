/**
 * Unit tests for convertToMilliseconds — a pure time-string parser.
 *
 * Strategy (Black-Box): We assert only on the return value based on inputs.
 * No internals (regex, switch) are spied upon — internal refactors remain invisible.
 */
import { convertToMilliseconds } from '../../shared/utils/millisecond-conversion'

describe('convertToMilliseconds', () => {
  // ── Valid inputs ──────────────────────────────────────────────────────────

  describe('seconds unit (s)', () => {
    it('converts "1s" to 1000 ms', () => {
      expect(convertToMilliseconds('1s')).toBe(1000)
    })

    it('converts "30s" to 30 000 ms', () => {
      expect(convertToMilliseconds('30s')).toBe(30_000)
    })

    it('converts "0s" to 0 ms', () => {
      expect(convertToMilliseconds('0s')).toBe(0)
    })
  })

  describe('minutes unit (m)', () => {
    it('converts "1m" to 60 000 ms', () => {
      expect(convertToMilliseconds('1m')).toBe(60_000)
    })

    it('converts "15m" to 900 000 ms', () => {
      expect(convertToMilliseconds('15m')).toBe(900_000)
    })
  })

  describe('hours unit (h)', () => {
    it('converts "1h" to 3 600 000 ms', () => {
      expect(convertToMilliseconds('1h')).toBe(3_600_000)
    })

    it('converts "24h" to 86 400 000 ms', () => {
      expect(convertToMilliseconds('24h')).toBe(86_400_000)
    })
  })

  describe('days unit (d)', () => {
    it('converts "1d" to 86 400 000 ms', () => {
      expect(convertToMilliseconds('1d')).toBe(86_400_000)
    })

    it('converts "7d" to 604 800 000 ms', () => {
      expect(convertToMilliseconds('7d')).toBe(604_800_000)
    })
  })

  // ── Invalid inputs ────────────────────────────────────────────────────────

  describe('invalid / unrecognised inputs', () => {
    it('returns undefined for empty string', () => {
      expect(convertToMilliseconds('')).toBeUndefined()
    })

    it('returns undefined for plain number with no unit', () => {
      expect(convertToMilliseconds('100')).toBeUndefined()
    })

    it('returns undefined for unknown unit "w"', () => {
      expect(convertToMilliseconds('1w')).toBeUndefined()
    })

    it('returns undefined for non-numeric prefix', () => {
      expect(convertToMilliseconds('xm')).toBeUndefined()
    })

    it('returns undefined for whitespace string', () => {
      expect(convertToMilliseconds(' ')).toBeUndefined()
    })
  })
})
