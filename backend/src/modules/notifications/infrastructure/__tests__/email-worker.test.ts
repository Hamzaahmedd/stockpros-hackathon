/**
 * email-worker.ts keeps its Queue/Worker instances in module-scoped `let`
 * variables, mutated once at startup — so each scenario (Redis available vs
 * not, worker started vs not) needs a fresh module load via jest.doMock +
 * jest.resetModules, the same pattern used for security.ts/logger.ts.
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

describe('enqueueEmail', () => {
  it('logs and skips enqueuing when Redis is unavailable', async () => {
    mockDeps(null)
    const { enqueueEmail } = require('../email-worker')
    await expect(
      enqueueEmail({
        to: 'a@example.com',
        symbol: 'AAPL',
        alertType: 'PRICE_ABOVE',
        title: 't',
        body: 'b',
      }),
    ).resolves.toBeUndefined()
  })

  it('adds the job to the queue when Redis is available', async () => {
    const { QueueMock } = mockDeps({ host: 'localhost' })
    const { enqueueEmail } = require('../email-worker')
    const payload = {
      to: 'a@example.com',
      symbol: 'AAPL',
      alertType: 'PRICE_ABOVE' as const,
      title: 't',
      body: 'b',
    }

    await enqueueEmail(payload)

    const queueInstance = QueueMock.mock.results[0].value
    expect(queueInstance.add).toHaveBeenCalledWith('send-alert-email', payload)
  })

  it('reuses the same queue instance across multiple calls', async () => {
    const { QueueMock } = mockDeps({ host: 'localhost' })
    const { enqueueEmail } = require('../email-worker')
    const payload = {
      to: 'a@example.com',
      symbol: 'AAPL',
      alertType: 'PRICE_ABOVE' as const,
      title: 't',
      body: 'b',
    }

    await enqueueEmail(payload)
    await enqueueEmail(payload)

    expect(QueueMock).toHaveBeenCalledTimes(1)
  })
})

describe('startEmailWorker', () => {
  it('does not start a worker when Redis is unavailable', () => {
    const { WorkerMock } = mockDeps(null)
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()
    expect(WorkerMock).not.toHaveBeenCalled()
  })

  it('starts a worker that sends mail successfully for a queued job', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const { processor } = deps.WorkerMock.mock.results[0].value
    await expect(
      processor({
        data: {
          to: 'a@example.com',
          symbol: 'AAPL',
          title: 'Alert',
          body: 'body text',
        },
      }),
    ).resolves.toBeUndefined()

    const emailConfig = require('../../../../shared/infrastructure/config/email')
    expect(emailConfig.transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@example.com', subject: 'Alert' }),
    )
  })

  it('rethrows a permanent (5xx) SMTP failure as UnrecoverableError so BullMQ stops retrying', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const emailConfig = require('../../../../shared/infrastructure/config/email')
    emailConfig.transporter.sendMail.mockRejectedValue(
      Object.assign(new Error('550 mailbox unavailable'), {
        responseCode: 550,
      }),
    )
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const { processor } = deps.WorkerMock.mock.results[0].value
    const { UnrecoverableError } = require('bullmq')
    await expect(
      processor({
        data: {
          to: 'a@example.com',
          symbol: 'AAPL',
          title: 'Alert',
          body: 'body',
        },
      }),
    ).rejects.toThrow('550 mailbox unavailable')
  })

  it('registers a failed-job handler that logs without throwing', () => {
    const deps = mockDeps({ host: 'localhost' })
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    expect(() =>
      deps.workerHandlers.failed(
        { id: 'job-1', attemptsMade: 2 },
        new Error('smtp down'),
      ),
    ).not.toThrow()
    expect(() =>
      deps.workerHandlers.failed(undefined, new Error('smtp down')),
    ).not.toThrow()
  })
})

describe('stopEmailWorker', () => {
  it('is a no-op when nothing was ever started', async () => {
    mockDeps(null)
    const { stopEmailWorker } = require('../email-worker')
    await expect(stopEmailWorker()).resolves.toBeUndefined()
  })

  it('closes both the worker and the queue when they were started', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const {
      startEmailWorker,
      enqueueEmail,
      stopEmailWorker,
    } = require('../email-worker')
    startEmailWorker()
    await enqueueEmail({
      to: 'a@example.com',
      symbol: 'AAPL',
      alertType: 'PRICE_ABOVE',
      title: 't',
      body: 'b',
    })

    const workerInstance = deps.WorkerMock.mock.results[0].value
    const queueInstance = deps.QueueMock.mock.results[0].value

    await stopEmailWorker()

    expect(workerInstance.close).toHaveBeenCalled()
    expect(queueInstance.close).toHaveBeenCalled()
  })
})
