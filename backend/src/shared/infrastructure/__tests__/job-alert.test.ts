const mockSend = jest.fn()
jest.mock('../ops-alert', () => ({
  ...jest.requireActual('../ops-alert'),
  sendOpsAlert: (...args: unknown[]) => mockSend(...args),
}))

import { alertJobFailure, isFinalFailure } from '../job-alert'

beforeEach(() => {
  jest.clearAllMocks()
  mockSend.mockResolvedValue(undefined)
})

describe('isFinalFailure', () => {
  it('is false while BullMQ still has attempts left', () => {
    expect(isFinalFailure({ attemptsMade: 1, opts: { attempts: 3 } })).toBe(
      false,
    )
    expect(isFinalFailure({ attemptsMade: 2, opts: { attempts: 3 } })).toBe(
      false,
    )
  })

  it('is true on the last attempt, and past it', () => {
    expect(isFinalFailure({ attemptsMade: 3, opts: { attempts: 3 } })).toBe(
      true,
    )
    expect(isFinalFailure({ attemptsMade: 4, opts: { attempts: 3 } })).toBe(
      true,
    )
  })

  it('treats a job queued without attempts as one-shot, so its first failure is final', () => {
    expect(isFinalFailure({ attemptsMade: 1 })).toBe(true)
    expect(isFinalFailure({ attemptsMade: 1, opts: {} })).toBe(true)
  })

  it('treats a job BullMQ no longer has as final', () => {
    expect(isFinalFailure(undefined)).toBe(true)
  })
})

describe('alertJobFailure', () => {
  const job = {
    id: 'job-42',
    name: 'send-alert',
    attemptsMade: 3,
    opts: { attempts: 3 },
  }

  it('alerts a job that failed for good, with ids and the error class only', async () => {
    await alertJobFailure({
      queue: 'email',
      job,
      error: new TypeError('550 <sam@fund.com>: rejected'),
    })

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledWith({
      kind: 'JOB_FAILED',
      key: 'email:send-alert',
      details: {
        queue: 'email',
        job: 'send-alert',
        jobId: 'job-42',
        attempts: 3,
        error: 'TypeError',
      },
    })
    expect(JSON.stringify(mockSend.mock.calls)).not.toContain('sam@fund.com')
  })

  it('stays quiet while BullMQ will retry', async () => {
    await alertJobFailure({
      queue: 'email',
      job: { ...job, attemptsMade: 1 },
      error: new Error('transient'),
    })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('prefers the name the worker passes (a cron definition) over the job name', async () => {
    await alertJobFailure({
      queue: 'news-cron',
      name: 'news-symbol-fetch',
      job: { ...job, name: 'whatever' },
      error: new Error('x'),
    })
    expect(mockSend.mock.calls[0][0]).toMatchObject({
      key: 'news-cron:news-symbol-fetch',
      details: { job: 'news-symbol-fetch' },
    })
  })

  it('turns a name with spaces or odd characters into a safe label', async () => {
    await alertJobFailure({
      queue: 'cron',
      name: 'daily digest @ 08:30/UTC',
      job,
      error: new Error('x'),
    })
    expect(mockSend.mock.calls[0][0].key).toBe('cron:daily-digest-08:30-UTC')
  })

  it('copes with a missing job: no id, no name, zero attempts', async () => {
    await alertJobFailure({ queue: 'email', error: 'boom' })
    expect(mockSend).toHaveBeenCalledWith({
      kind: 'JOB_FAILED',
      key: 'email:unknown',
      details: {
        queue: 'email',
        job: 'unknown',
        attempts: 0,
        error: 'unknown',
      },
    })
  })
})
