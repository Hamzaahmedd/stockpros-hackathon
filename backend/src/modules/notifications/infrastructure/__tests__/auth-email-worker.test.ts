/**
 * Same module-load-time singleton pattern as email-worker.ts — see that
 * test file's header comment for why jest.doMock + jest.resetModules is
 * needed here instead of static top-level mocks.
 */

const mockDeps = (redisClient: unknown) => {
  const QueueMock = jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  }))
  const workerHandlers: Record<string, (...args: any[]) => any> = {}
  const WorkerMock = jest.fn().mockImplementation((_name, processor) => ({
    processor,
    on: jest.fn((event: string, handler: (...args: any[]) => any) => {
      workerHandlers[event] = handler
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }))

  jest.doMock('bullmq', () => ({
    ...jest.requireActual('bullmq'),
    Queue: QueueMock,
    Worker: WorkerMock,
  }))
  jest.doMock('../../../../shared/infrastructure/cache', () => ({
    getRedisClient: jest.fn().mockReturnValue(redisClient),
  }))
  jest.doMock('../../../../shared/infrastructure/config/email', () => ({
    transporter: { sendMail: jest.fn().mockResolvedValue(undefined) },
    getLogoSrc: jest.fn().mockReturnValue('cid:logo'),
  }))

  return { QueueMock, WorkerMock, workerHandlers }
}

beforeEach(() => {
  jest.resetModules()
})

describe('enqueueAuthEmail', () => {
  it('returns false and logs when Redis is unavailable', async () => {
    mockDeps(null)
    const { enqueueAuthEmail } = require('../auth-email-worker')
    await expect(
      enqueueAuthEmail({
        to: 'a@example.com',
        loginLink: 'https://x',
        expiryMinutes: 10,
      }),
    ).resolves.toBe(false)
  })

  it('adds the job and returns true when Redis is available', async () => {
    const { QueueMock } = mockDeps({ host: 'localhost' })
    const { enqueueAuthEmail } = require('../auth-email-worker')
    const payload = {
      to: 'a@example.com',
      loginLink: 'https://x',
      expiryMinutes: 10,
    }

    await expect(enqueueAuthEmail(payload)).resolves.toBe(true)
    const queueInstance = QueueMock.mock.results[0].value
    expect(queueInstance.add).toHaveBeenCalledWith(
      'send-magic-link-email',
      payload,
    )
  })

  it('reuses the same queue instance across multiple calls', async () => {
    const { QueueMock } = mockDeps({ host: 'localhost' })
    const { enqueueAuthEmail } = require('../auth-email-worker')
    const payload = {
      to: 'a@example.com',
      loginLink: 'https://x',
      expiryMinutes: 10,
    }

    await enqueueAuthEmail(payload)
    await enqueueAuthEmail(payload)

    expect(QueueMock).toHaveBeenCalledTimes(1)
  })
})

describe('startAuthEmailWorker', () => {
  it('does not start a worker when Redis is unavailable', () => {
    const { WorkerMock } = mockDeps(null)
    const { startAuthEmailWorker } = require('../auth-email-worker')
    startAuthEmailWorker()
    expect(WorkerMock).not.toHaveBeenCalled()
  })

  it('sends the magic-link email successfully for a queued job', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const { startAuthEmailWorker } = require('../auth-email-worker')
    startAuthEmailWorker()

    const { processor } = deps.WorkerMock.mock.results[0].value
    await expect(
      processor({
        data: {
          to: 'a@example.com',
          loginLink: 'https://x',
          expiryMinutes: 10,
        },
      }),
    ).resolves.toBeUndefined()

    const emailConfig = require('../../../../shared/infrastructure/config/email')
    expect(emailConfig.transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@example.com' }),
    )
  })

  it('rethrows a permanent (5xx) SMTP failure so BullMQ stops retrying', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const emailConfig = require('../../../../shared/infrastructure/config/email')
    emailConfig.transporter.sendMail.mockRejectedValue(
      Object.assign(new Error('550 mailbox unavailable'), {
        responseCode: 550,
      }),
    )
    const { startAuthEmailWorker } = require('../auth-email-worker')
    startAuthEmailWorker()

    const { processor } = deps.WorkerMock.mock.results[0].value
    await expect(
      processor({
        data: {
          to: 'a@example.com',
          loginLink: 'https://x',
          expiryMinutes: 10,
        },
      }),
    ).rejects.toThrow('550 mailbox unavailable')
  })

  it('registers a failed-job handler that logs without throwing', () => {
    const deps = mockDeps({ host: 'localhost' })
    const { startAuthEmailWorker } = require('../auth-email-worker')
    startAuthEmailWorker()

    expect(() =>
      deps.workerHandlers.failed(
        { id: 'job-1', attemptsMade: 1 },
        new Error('smtp down'),
      ),
    ).not.toThrow()
    expect(() =>
      deps.workerHandlers.failed(undefined, new Error('smtp down')),
    ).not.toThrow()
  })
})

describe('stopAuthEmailWorker', () => {
  it('is a no-op when nothing was ever started', async () => {
    mockDeps(null)
    const { stopAuthEmailWorker } = require('../auth-email-worker')
    await expect(stopAuthEmailWorker()).resolves.toBeUndefined()
  })

  it('closes both the worker and the queue when they were started', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const {
      startAuthEmailWorker,
      enqueueAuthEmail,
      stopAuthEmailWorker,
    } = require('../auth-email-worker')
    startAuthEmailWorker()
    await enqueueAuthEmail({
      to: 'a@example.com',
      loginLink: 'https://x',
      expiryMinutes: 10,
    })

    const workerInstance = deps.WorkerMock.mock.results[0].value
    const queueInstance = deps.QueueMock.mock.results[0].value

    await stopAuthEmailWorker()

    expect(workerInstance.close).toHaveBeenCalled()
    expect(queueInstance.close).toHaveBeenCalled()
  })
})

// Makes this file a module so its top-level helpers do not collide with other
// import-less test files in the shared ts-jest program (TS2451).
export {}

describe('magic-link worker — validation and PII-free logging', () => {
  const validJob = {
    to: 'secret.person@fund.com',
    loginLink: 'https://app.example/auth/verify?token=SECRET-TOKEN',
    expiryMinutes: 10,
  }

  const start = () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }
    const deps = mockDeps({ host: 'localhost' })
    jest.doMock('../../../../shared/infrastructure/logger', () => ({ logger }))
    const { startAuthEmailWorker } = require('../auth-email-worker')
    startAuthEmailWorker()
    const { UnrecoverableError } = require('bullmq')
    const emailConfig = require('../../../../shared/infrastructure/config/email')
    return {
      processor: deps.WorkerMock.mock.results[0].value.processor,
      logger,
      deps,
      UnrecoverableError,
      sendMail: emailConfig.transporter.sendMail as jest.Mock,
    }
  }

  it('logs only the job id on success — no address, no login link', async () => {
    const { processor, logger, sendMail } = start()

    await processor({ id: 'job-1', data: validJob })

    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(
      '[AuthEmailWorker] Magic link sent',
      { jobId: 'job-1' },
    )
    const printed = JSON.stringify(logger.info.mock.calls)
    expect(printed).not.toContain('secret.person')
    expect(printed).not.toContain('SECRET-TOKEN')
  })

  it.each([
    ['a non-http link', { ...validJob, loginLink: 'javascript:alert(1)' }],
    ['a bad recipient', { ...validJob, to: 'nope' }],
    ['a zero expiry', { ...validJob, expiryMinutes: 0 }],
    ['no data', undefined],
  ])(
    'rejects %s permanently without sending or logging values',
    async (_label, data) => {
      const { processor, logger, UnrecoverableError, sendMail } = start()

      await expect(processor({ id: 'job-2', data })).rejects.toBeInstanceOf(
        UnrecoverableError,
      )

      expect(sendMail).not.toHaveBeenCalled()
      const printed = JSON.stringify(logger.error.mock.calls)
      expect(printed).toContain('job-2')
      expect(printed).not.toMatch(/@|javascript|SECRET/)
    },
  )

  it('scrubs a recipient echoed in a failed-job error before logging it', () => {
    const { logger, deps } = start()

    deps.workerHandlers.failed(
      { id: 'job-3', attemptsMade: 3 },
      new Error('550 <secret.person@fund.com>: rejected'),
    )

    const message = logger.error.mock.calls[0][0] as string
    expect(message).toContain('[redacted-email]')
    expect(message).not.toContain('secret.person')
  })
})
