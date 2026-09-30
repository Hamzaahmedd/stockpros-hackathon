import { AppError } from '../app-error'
import {
  OVERAGE_REQUIRED_CODE,
  OverageReason,
  OverageRequiredError,
} from '../overage-required-error'

describe('OverageRequiredError', () => {
  const details = {
    reason: OverageReason.INSUFFICIENT_CREDITS,
    feature: 'ai_forecast',
    canTopUp: true,
  }

  it('is a 403 operational AppError', () => {
    const err = new OverageRequiredError(details)
    expect(err).toBeInstanceOf(AppError)
    expect(err.statusCode).toBe(403)
    expect(err.isOperational).toBe(true)
    expect(err.name).toBe('OverageRequiredError')
    expect(err.message).toContain('top up credits')
  })

  it('prefixes the details with the stable OVERAGE_REQUIRED code', () => {
    const err = new OverageRequiredError({
      ...details,
      reason: OverageReason.SPEND_LIMIT_REACHED,
      canTopUp: false,
    })
    expect(OVERAGE_REQUIRED_CODE).toBe('OVERAGE_REQUIRED')
    expect(err.details).toEqual({
      code: 'OVERAGE_REQUIRED',
      reason: 'SPEND_LIMIT_REACHED',
      feature: 'ai_forecast',
      canTopUp: false,
    })
  })
})
