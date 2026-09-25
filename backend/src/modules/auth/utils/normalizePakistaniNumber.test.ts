import { ValidationError } from '../../../shared/errors'
import { normalizePakistaniNumber } from './normalizePakistaniNumber'

describe('normalizePakistaniNumber', () => {
  describe('accepts valid Pakistani mobile numbers', () => {
    const cases: Array<[string, string]> = [
      ['03001234567', '+923001234567'],
      ['923001234567', '+923001234567'],
      ['+923001234567', '+923001234567'],
      ['0300 123 4567', '+923001234567'],
      ['0300-123-4567', '+923001234567'],
      ['(0300) 123-4567', '+923001234567'],
      ['+92 300 123 4567', '+923001234567'],
      ['92 300 123 4567', '+923001234567'],
      ['  03001234567  ', '+923001234567'],
    ]

    it.each(cases)('normalizes %s to %s', (input, expected) => {
      expect(normalizePakistaniNumber(input)).toBe(expected)
    })
  })

  describe('rejects invalid input', () => {
    it('rejects empty string', () => {
      expect(() => normalizePakistaniNumber('')).toThrow(ValidationError)
      expect(() => normalizePakistaniNumber('   ')).toThrow(ValidationError)
    })

    it('rejects non-string input', () => {
      // @ts-expect-error - deliberately passing a non-string to test runtime guard
      expect(() => normalizePakistaniNumber(undefined)).toThrow(ValidationError)
      // @ts-expect-error - deliberately passing a non-string to test runtime guard
      expect(() => normalizePakistaniNumber(null)).toThrow(ValidationError)
    })

    it('rejects garbage / non-numeric input', () => {
      expect(() => normalizePakistaniNumber('not-a-number')).toThrow(
        ValidationError,
      )
      expect(() => normalizePakistaniNumber('abc1234567890')).toThrow(
        ValidationError,
      )
    })

    it('rejects non-Pakistani country codes', () => {
      expect(() => normalizePakistaniNumber('+14155552671')).toThrow(
        ValidationError,
      )
      expect(() => normalizePakistaniNumber('+919812345678')).toThrow(
        ValidationError,
      )
    })

    it('rejects wrong-length local numbers', () => {
      expect(() => normalizePakistaniNumber('030012345')).toThrow(
        // too short
        ValidationError,
      )
      expect(() => normalizePakistaniNumber('030012345678')).toThrow(
        // too long
        ValidationError,
      )
    })

    it('rejects wrong-length E.164 digit strings', () => {
      expect(() => normalizePakistaniNumber('92300123456')).toThrow(
        // too short
        ValidationError,
      )
      expect(() => normalizePakistaniNumber('9230012345678')).toThrow(
        // too long
        ValidationError,
      )
    })

    it('rejects local numbers not starting with 03', () => {
      expect(() => normalizePakistaniNumber('04001234567')).toThrow(
        ValidationError,
      )
      expect(() => normalizePakistaniNumber('13001234567')).toThrow(
        ValidationError,
      )
    })

    it('throws with a helpful message', () => {
      expect(() => normalizePakistaniNumber('123')).toThrow(
        /valid Pakistani mobile number/i,
      )
    })
  })
})
