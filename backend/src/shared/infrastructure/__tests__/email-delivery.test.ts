import { UnrecoverableError } from 'bullmq'
import { rethrowEmailError } from '../email-delivery'

describe('rethrowEmailError', () => {
  it('rethrows a 5xx SMTP rejection as UnrecoverableError so BullMQ stops retrying', () => {
    const err = Object.assign(new Error('550 5.1.1 mailbox unavailable'), {
      responseCode: 550,
    })

    expect(() => rethrowEmailError(err)).toThrow(UnrecoverableError)
  })

  it('rethrows a 4xx SMTP response as-is so BullMQ retries with backoff', () => {
    const err = Object.assign(new Error('421 too busy'), {
      responseCode: 421,
    })

    expect(() => rethrowEmailError(err)).toThrow(err)
    expect(() => rethrowEmailError(err)).not.toThrow(UnrecoverableError)
  })

  it('rethrows a connection-level error (no responseCode) as-is so BullMQ retries', () => {
    const err = Object.assign(new Error('connect ETIMEDOUT'), {
      code: 'ETIMEDOUT',
    })

    expect(() => rethrowEmailError(err)).toThrow(err)
    expect(() => rethrowEmailError(err)).not.toThrow(UnrecoverableError)
  })

  it('a permanent rejection that is not an Error object gets a generic message with no recipient', () => {
    let thrown: unknown
    try {
      rethrowEmailError({ responseCode: 553 })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(UnrecoverableError)
    expect((thrown as Error).message).toBe('SMTP 553 rejecting the recipient')
    expect((thrown as Error).message).not.toContain('@')
  })
})
