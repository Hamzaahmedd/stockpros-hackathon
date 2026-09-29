import { UnrecoverableError } from 'bullmq'
import { rethrowEmailError } from '../email-delivery'

describe('rethrowEmailError', () => {
  it('rethrows a 5xx SMTP rejection as UnrecoverableError so BullMQ stops retrying', () => {
    const err = Object.assign(new Error('550 5.1.1 mailbox unavailable'), {
      responseCode: 550,
    })

    expect(() => rethrowEmailError(err, 'bad@example.com')).toThrow(
      UnrecoverableError,
    )
  })

  it('rethrows a 4xx SMTP response as-is so BullMQ retries with backoff', () => {
    const err = Object.assign(new Error('421 too busy'), {
      responseCode: 421,
    })

    expect(() => rethrowEmailError(err, 'user@example.com')).toThrow(err)
    expect(() => rethrowEmailError(err, 'user@example.com')).not.toThrow(
      UnrecoverableError,
    )
  })

  it('rethrows a connection-level error (no responseCode) as-is so BullMQ retries', () => {
    const err = Object.assign(new Error('connect ETIMEDOUT'), {
      code: 'ETIMEDOUT',
    })

    expect(() => rethrowEmailError(err, 'user@example.com')).toThrow(err)
    expect(() => rethrowEmailError(err, 'user@example.com')).not.toThrow(
      UnrecoverableError,
    )
  })
})
