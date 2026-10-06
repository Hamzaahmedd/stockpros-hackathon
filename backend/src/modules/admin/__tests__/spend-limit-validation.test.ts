import {
  USER_SPEND_CAP_MAX_PAISA,
  USER_SPEND_CAP_MIN_PAISA,
} from '../../payments/public'
import { spendLimitValidator } from '../validation'

const valid = {
  monthlyLimitPaisa: 50_000,
  reason: 'Customer asked support to raise their limit',
  ticketRef: 'SUP-1234',
}

describe('spendLimitValidator', () => {
  it('accepts a limit, and null to remove it', () => {
    expect(spendLimitValidator.safeParse(valid).success).toBe(true)
    expect(
      spendLimitValidator.safeParse({ ...valid, monthlyLimitPaisa: null })
        .success,
    ).toBe(true)
  })

  it('accepts the exact bounds and rejects values just outside them', () => {
    const parse = (monthlyLimitPaisa: number) =>
      spendLimitValidator.safeParse({ ...valid, monthlyLimitPaisa }).success
    expect(parse(USER_SPEND_CAP_MIN_PAISA)).toBe(true)
    expect(parse(USER_SPEND_CAP_MAX_PAISA)).toBe(true)
    expect(parse(USER_SPEND_CAP_MIN_PAISA - 1)).toBe(false)
    expect(parse(USER_SPEND_CAP_MAX_PAISA + 1)).toBe(false)
  })

  it('rejects fractional paisa, a missing limit and non-numbers', () => {
    const { monthlyLimitPaisa: _omitted, ...withoutLimit } = valid
    expect(
      spendLimitValidator.safeParse({ ...valid, monthlyLimitPaisa: 10.5 })
        .success,
    ).toBe(false)
    expect(spendLimitValidator.safeParse(withoutLimit).success).toBe(false)
    expect(
      spendLimitValidator.safeParse({ ...valid, monthlyLimitPaisa: '500' })
        .success,
    ).toBe(false)
  })

  it('always requires a ticket reference, in the SUP-1234 format', () => {
    const { ticketRef: _omitted, ...withoutTicket } = valid
    expect(spendLimitValidator.safeParse(withoutTicket).success).toBe(false)
    expect(
      spendLimitValidator.safeParse({ ...valid, ticketRef: '' }).success,
    ).toBe(false)
    expect(
      spendLimitValidator.safeParse({ ...valid, ticketRef: 'sup-1' }).success,
    ).toBe(false)
  })

  it('requires a reason of at least 10 characters', () => {
    const { reason: _omitted, ...withoutReason } = valid
    expect(spendLimitValidator.safeParse(withoutReason).success).toBe(false)
    expect(
      spendLimitValidator.safeParse({ ...valid, reason: 'too short' }).success,
    ).toBe(false)
  })
})
