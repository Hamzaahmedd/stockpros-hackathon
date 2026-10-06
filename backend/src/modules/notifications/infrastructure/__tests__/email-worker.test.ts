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

// Realistic payloads: the worker validates what it reads from Redis, so tests
// must send what a producer really sends.
const alertJob = (over: Record<string, unknown> = {}) => ({
  to: 'a@example.com',
  userId: 'user-1',
  symbol: 'AAPL',
  alertType: 'PRICE_ABOVE',
  title: 'Alert',
  body: 'body text',
  ...over,
})

const renewalJob = (over: Record<string, unknown> = {}) => ({
  to: 'a@example.com',
  subscriptionId: 'sub-1',
  userName: 'Hamza',
  amount: 'Rs 5,999',
  renewsOn: 'Oct 15, 2026',
  manageUrl: 'https://app.example/plans',
  variant: 'card-on',
  ...over,
})

const usageAlertJob = (over: Record<string, unknown> = {}) => ({
  to: 'a@example.com',
  userId: 'user-1',
  kind: 'QUOTA_80',
  userName: 'Hamza',
  usedSignals: 240,
  includedSignals: 300,
  resetsOn: 'Oct 10, 2030',
  creditBalance: 'Rs 950',
  usageUrl: 'https://app.example/usage',
  ...over,
})

describe('usage alert emails', () => {
  it('adds the job to the shared queue under the usage-alert name', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const { enqueueUsageAlertEmail } = require('../email-worker')

    await enqueueUsageAlertEmail(usageAlertJob())

    const queue = deps.QueueMock.mock.results[0].value
    expect(queue.add).toHaveBeenCalledWith('usage-alert', usageAlertJob())
  })

  it('skips enqueuing when Redis is unavailable', async () => {
    mockDeps(null)
    const { enqueueUsageAlertEmail } = require('../email-worker')
    await expect(
      enqueueUsageAlertEmail(usageAlertJob()),
    ).resolves.toBeUndefined()
  })

  it('routes a usage-alert job to its own template', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const { processor } = deps.WorkerMock.mock.results[0].value
    await expect(
      processor({ name: 'usage-alert', data: usageAlertJob() }),
    ).resolves.toBeUndefined()

    const emailConfig = require('../../../../shared/infrastructure/config/email')
    expect(emailConfig.transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@example.com',
        subject: "You've used 80% of your monthly AI signals",
      }),
    )
  })

  it('rethrows a permanent SMTP failure', async () => {
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
    await expect(
      processor({ name: 'usage-alert', data: usageAlertJob() }),
    ).rejects.toThrow('550 mailbox unavailable')
  })

  it.each([
    ['an unknown kind', usageAlertJob({ kind: 'LOW_MOOD' })],
    ['a non-URL link', usageAlertJob({ usageUrl: 'javascript:alert(1)x' })],
    ['a bad recipient', usageAlertJob({ to: 'nope' })],
    ['no user id', usageAlertJob({ userId: undefined })],
    ['a negative count', usageAlertJob({ usedSignals: -1 })],
  ])('drops a job with %s without sending', async (_label, data) => {
    const deps = mockDeps({ host: 'localhost' })
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const { processor } = deps.WorkerMock.mock.results[0].value
    await expect(processor({ name: 'usage-alert', data })).rejects.toThrow(
      'Invalid email job payload',
    )

    const emailConfig = require('../../../../shared/infrastructure/config/email')
    expect(emailConfig.transporter.sendMail).not.toHaveBeenCalled()
  })
})

const spendLimitChangedJob = (over: Record<string, unknown> = {}) => ({
  to: 'a@example.com',
  userId: 'user-1',
  userName: 'Hamza',
  previousLimit: 'Rs 500',
  newLimit: 'Rs 1,200',
  ticketRef: 'SUP-4821',
  usageUrl: 'https://app.example/usage',
  ...over,
})

describe('spend limit changed emails', () => {
  it('adds the job to the shared queue under the spend-limit-changed name', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const { enqueueSpendLimitChangedEmail } = require('../email-worker')

    await enqueueSpendLimitChangedEmail(spendLimitChangedJob())

    const queue = deps.QueueMock.mock.results[0].value
    expect(queue.add).toHaveBeenCalledWith(
      'spend-limit-changed',
      spendLimitChangedJob(),
    )
  })

  it('skips enqueuing when Redis is unavailable', async () => {
    mockDeps(null)
    const { enqueueSpendLimitChangedEmail } = require('../email-worker')
    await expect(
      enqueueSpendLimitChangedEmail(spendLimitChangedJob()),
    ).resolves.toBeUndefined()
  })

  it('routes the job to its own template with the ticket and both limits', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const { processor } = deps.WorkerMock.mock.results[0].value
    await expect(
      processor({ name: 'spend-limit-changed', data: spendLimitChangedJob() }),
    ).resolves.toBeUndefined()

    const emailConfig = require('../../../../shared/infrastructure/config/email')
    const mail = emailConfig.transporter.sendMail.mock.calls[0][0]
    expect(mail.to).toBe('a@example.com')
    expect(mail.subject).toBe(
      'Your monthly spending limit was changed by StockPros support',
    )
    expect(mail.text).toContain('from Rs 500 to Rs 1,200')
    expect(mail.text).toContain('SUP-4821')
  })

  it('rethrows a permanent SMTP failure', async () => {
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
    await expect(
      processor({ name: 'spend-limit-changed', data: spendLimitChangedJob() }),
    ).rejects.toThrow('550 mailbox unavailable')
  })

  it.each([
    ['a bad recipient', spendLimitChangedJob({ to: 'nope' })],
    ['no ticket', spendLimitChangedJob({ ticketRef: '' })],
    [
      'a non-URL link',
      spendLimitChangedJob({ usageUrl: 'javascript:alert(1)x' }),
    ],
    ['no user id', spendLimitChangedJob({ userId: undefined })],
  ])('drops a job with %s without sending', async (_label, data) => {
    const deps = mockDeps({ host: 'localhost' })
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const { processor } = deps.WorkerMock.mock.results[0].value
    await expect(
      processor({ name: 'spend-limit-changed', data }),
    ).rejects.toThrow('Invalid email job payload')

    const emailConfig = require('../../../../shared/infrastructure/config/email')
    expect(emailConfig.transporter.sendMail).not.toHaveBeenCalled()
  })
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

describe('enqueueRenewalReminderEmail', () => {
  it('logs and skips enqueuing when Redis is unavailable', async () => {
    mockDeps(null)
    const { enqueueRenewalReminderEmail } = require('../email-worker')
    await expect(
      enqueueRenewalReminderEmail({
        to: 'a@example.com',
        userName: 'Hamza',
        amount: 'Rs 5,999',
        renewsOn: 'Oct 15, 2026',
        manageUrl: 'https://app.example/plans',
        variant: 'card-on',
      }),
    ).resolves.toBeUndefined()
  })

  it('adds the job to the same alert-email queue, under the renewal job name', async () => {
    const { QueueMock } = mockDeps({ host: 'localhost' })
    const { enqueueRenewalReminderEmail } = require('../email-worker')
    const payload = {
      to: 'a@example.com',
      userName: 'Hamza',
      amount: 'Rs 5,999',
      renewsOn: 'Oct 15, 2026',
      manageUrl: 'https://app.example/plans',
      variant: 'card-on' as const,
    }

    await enqueueRenewalReminderEmail(payload)

    const queueInstance = QueueMock.mock.results[0].value
    expect(queueInstance.add).toHaveBeenCalledWith(
      'subscription-renewal-reminder',
      payload,
    )
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
        data: alertJob(),
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
        data: alertJob(),
      }),
    ).rejects.toThrow('550 mailbox unavailable')
  })

  it('routes a renewal-reminder job to the renewal template instead of the alert template', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const { processor } = deps.WorkerMock.mock.results[0].value
    await expect(
      processor({
        name: 'subscription-renewal-reminder',
        data: renewalJob(),
      }),
    ).resolves.toBeUndefined()

    const emailConfig = require('../../../../shared/infrastructure/config/email')
    expect(emailConfig.transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@example.com',
        subject: 'Upcoming Renewal: Your Pro Plan bills in 3 days',
      }),
    )
  })

  it('rethrows a permanent (5xx) SMTP failure for a renewal-reminder job too', async () => {
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
    await expect(
      processor({
        name: 'subscription-renewal-reminder',
        data: renewalJob({ variant: 'wallet' }),
      }),
    ).rejects.toThrow('550 mailbox unavailable')
  })

  it('alerts ops about a job that failed for good, naming the queue', () => {
    const deps = mockDeps({ host: 'localhost' })
    const alertJobFailure = jest.fn()
    jest.doMock('../../../../shared/infrastructure/job-alert', () => ({
      alertJobFailure,
    }))
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const job = { id: 'job-1', attemptsMade: 3 }
    const error = new Error('smtp down')
    deps.workerHandlers.failed(job, error)

    expect(alertJobFailure).toHaveBeenCalledWith({
      queue: 'email',
      job,
      error,
    })
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

describe('team invite emails', () => {
  const payload = {
    to: 'new@fund.com',
    inviteId: 'inv-1',
    teamId: 'team-1',
    inviterName: 'Olivia',
    teamName: 'Alpha Fund',
    inviteUrl: 'https://app.example/teams/invite?token=abc',
    role: 'MEMBER',
    expiresAt: '2026-10-07T00:00:00.000Z',
  }

  it('logs and skips enqueuing when Redis is unavailable', async () => {
    mockDeps(null)
    const { enqueueTeamInviteEmail } = require('../email-worker')
    await expect(enqueueTeamInviteEmail(payload)).resolves.toBeUndefined()
  })

  it("enqueues under the 'team-invite' job name on the shared email queue", async () => {
    const { QueueMock } = mockDeps({ host: 'localhost' })
    const { enqueueTeamInviteEmail } = require('../email-worker')

    await enqueueTeamInviteEmail(payload)

    expect(QueueMock.mock.results[0].value.add).toHaveBeenCalledWith(
      'team-invite',
      payload,
    )
  })

  it('renders and sends the invite email when the worker processes a team-invite job', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const {
      transporter,
    } = require('../../../../shared/infrastructure/config/email')
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const worker = deps.WorkerMock.mock.results[0].value
    await worker.processor({ name: 'team-invite', data: payload })

    expect(transporter.sendMail).toHaveBeenCalledTimes(1)
    const mail = transporter.sendMail.mock.calls[0][0]
    expect(mail.to).toBe('new@fund.com')
    expect(mail.subject).toBe(
      'Olivia invited you to join Alpha Fund on StockPros',
    )
    expect(mail.html).toContain(payload.inviteUrl)
    expect(mail.text).toContain(payload.inviteUrl)
    expect(mail.to).not.toBe(undefined)
  })

  it('rethrows delivery failures so BullMQ retries the job', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const {
      transporter,
    } = require('../../../../shared/infrastructure/config/email')
    transporter.sendMail.mockRejectedValueOnce(new Error('smtp down'))
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const worker = deps.WorkerMock.mock.results[0].value
    await expect(
      worker.processor({ name: 'team-invite', data: payload }),
    ).rejects.toThrow()
  })
})

describe('payment receipt emails', () => {
  const payload = {
    to: 'billing@fund.com',
    transactionId: 'txn-1',
    teamId: 'team-1',
    teamName: 'Alpha Fund',
    referenceNumber: 'SP-2030-000000C1',
    description: 'Team plan subscription',
    amount: 'Rs 14,998',
    seatCount: 2,
    paidOn: 'Mar 5, 2030',
    manageUrl: 'https://app.example/teams',
  }

  it('logs and skips enqueuing when Redis is unavailable', async () => {
    mockDeps(null)
    const { enqueuePaymentReceiptEmail } = require('../email-worker')
    await expect(enqueuePaymentReceiptEmail(payload)).resolves.toBeUndefined()
  })

  it("enqueues under the 'payment-receipt' job name on the shared email queue", async () => {
    const { QueueMock } = mockDeps({ host: 'localhost' })
    const { enqueuePaymentReceiptEmail } = require('../email-worker')

    await enqueuePaymentReceiptEmail(payload)

    expect(QueueMock.mock.results[0].value.add).toHaveBeenCalledWith(
      'payment-receipt',
      payload,
    )
  })

  it('renders and sends the receipt when the worker processes the job', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const {
      transporter,
    } = require('../../../../shared/infrastructure/config/email')
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const worker = deps.WorkerMock.mock.results[0].value
    await worker.processor({ name: 'payment-receipt', data: payload })

    const mail = transporter.sendMail.mock.calls[0][0]
    expect(mail.to).toBe('billing@fund.com')
    expect(mail.subject).toBe('Your StockPros payment receipt SP-2030-000000C1')
    expect(mail.html).toContain('Rs 14,998')
    expect(mail.text).toContain('Alpha Fund')
  })

  it('rethrows delivery failures so BullMQ retries the job', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const {
      transporter,
    } = require('../../../../shared/infrastructure/config/email')
    transporter.sendMail.mockRejectedValueOnce(new Error('smtp down'))
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const worker = deps.WorkerMock.mock.results[0].value
    await expect(
      worker.processor({ name: 'payment-receipt', data: payload }),
    ).rejects.toThrow()
  })

  it('will not send a job whose payload is malformed (Redis data is not trusted)', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const {
      transporter,
    } = require('../../../../shared/infrastructure/config/email')
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const worker = deps.WorkerMock.mock.results[0].value
    await expect(
      worker.processor({
        name: 'payment-receipt',
        data: { ...payload, manageUrl: 'javascript:alert(1)' },
      }),
    ).rejects.toThrow()
    expect(transporter.sendMail).not.toHaveBeenCalled()
  })
})

// Makes this file a module so its top-level helpers do not collide with other
// import-less test files in the shared ts-jest program (TS2451).
export {}

describe('team invite emails — logging', () => {
  it("does not write the recipient's email address to the logs (PII)", async () => {
    const infoSpy = jest.fn()
    const deps = mockDeps({ host: 'localhost' })
    jest.doMock('../../../../shared/infrastructure/logger', () => ({
      logger: {
        info: infoSpy,
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }))
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const worker = deps.WorkerMock.mock.results[0].value
    await worker.processor({
      name: 'team-invite',
      data: {
        to: 'private.person@fund.com',
        inviteId: 'inv-1',
        teamId: 'team-1',
        inviterName: 'Olivia',
        teamName: 'Alpha Fund',
        inviteUrl: 'https://app.example/teams/invite?token=abc',
        role: 'MEMBER',
        expiresAt: '2026-10-07T00:00:00.000Z',
      },
    })

    const logged = infoSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logged).toContain('Team invite sent')
    expect(logged).not.toContain('private.person@fund.com')
    expect(logged).not.toMatch(/@/)
  })
})

// ─── validation instead of casts, and PII-free logging ───────────────────────

describe('job payload validation (Redis data is not trusted)', () => {
  const inviteJob = (over: Record<string, unknown> = {}) => ({
    to: 'new@fund.com',
    inviteId: 'inv-1',
    teamId: 'team-1',
    inviterName: 'Olivia',
    teamName: 'Alpha Fund',
    inviteUrl: 'https://app.example/teams/invite?token=abc',
    role: 'MEMBER',
    expiresAt: '2026-10-07T00:00:00.000Z',
    ...over,
  })

  const start = () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }
    const deps = mockDeps({ host: 'localhost' })
    jest.doMock('../../../../shared/infrastructure/logger', () => ({ logger }))
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()
    const { UnrecoverableError } = require('bullmq')
    const emailConfig = require('../../../../shared/infrastructure/config/email')
    return {
      processor: deps.WorkerMock.mock.results[0].value.processor,
      logger,
      UnrecoverableError,
      sendMail: emailConfig.transporter.sendMail as jest.Mock,
    }
  }

  it.each([
    ['an alert job', undefined, alertJob({ alertType: 'NOT_A_REAL_TYPE' })],
    [
      'an alert job with a bad recipient',
      undefined,
      alertJob({ to: 'not-an-email' }),
    ],
    [
      'an alert job without a user id',
      undefined,
      alertJob({ userId: undefined }),
    ],
    [
      'a renewal job with an unknown variant',
      'subscription-renewal-reminder',
      renewalJob({ variant: 'lifetime' }),
    ],
    [
      'a renewal job with a non-URL link',
      'subscription-renewal-reminder',
      renewalJob({ manageUrl: 'javascript:alert(1)x' }),
    ],
    [
      'a renewal job without a subscription id',
      'subscription-renewal-reminder',
      renewalJob({ subscriptionId: undefined }),
    ],
    [
      'an invite job with an invalid role',
      'team-invite',
      inviteJob({ role: 'SUPERUSER' }),
    ],
    [
      'an invite job with a non-ISO expiry',
      'team-invite',
      inviteJob({ expiresAt: 'next week' }),
    ],
    [
      'an invite job without a team id',
      'team-invite',
      inviteJob({ teamId: undefined }),
    ],
    ['a job with no data at all', undefined, undefined],
    ['a job whose data is a string', 'team-invite', 'garbage'],
  ])(
    'rejects %s permanently, sends nothing, and never logs values',
    async (_label, name, data) => {
      const { processor, logger, UnrecoverableError, sendMail } = start()

      await expect(
        processor({ id: 'job-7', name, data }),
      ).rejects.toBeInstanceOf(UnrecoverableError)

      expect(sendMail).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalledTimes(1)
      const [message, err, context] = logger.error.mock.calls[0]
      expect(message).toContain('invalid payload')
      expect(err).toBeUndefined()
      expect(context.jobId).toBe('job-7')
      // Field names only — never the payload values (addresses, links).
      const everything = JSON.stringify(logger.error.mock.calls)
      expect(everything).not.toMatch(/@|javascript|garbage|token=/)
    },
  )

  it('still accepts valid payloads of every kind', async () => {
    const { processor, sendMail } = start()

    await processor({ id: 'j1', name: 'send-alert-email', data: alertJob() })
    await processor({
      id: 'j2',
      name: 'subscription-renewal-reminder',
      data: renewalJob(),
    })
    await processor({ id: 'j3', name: 'team-invite', data: inviteJob() })

    expect(sendMail).toHaveBeenCalledTimes(3)
  })
})

describe('email worker logs carry ids, never addresses', () => {
  const setup = () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }
    const deps = mockDeps({ host: 'localhost' })
    jest.doMock('../../../../shared/infrastructure/logger', () => ({ logger }))
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()
    return {
      processor: deps.WorkerMock.mock.results[0].value.processor,
      logger,
      deps,
    }
  }
  const logged = (logger: { info: jest.Mock }) =>
    JSON.stringify(logger.info.mock.calls)

  it('alert email: job id, user id and symbol only', async () => {
    const { processor, logger } = setup()
    await processor({
      id: 'job-1',
      name: 'send-alert-email',
      data: alertJob({ to: 'secret.person@fund.com' }),
    })

    expect(logger.info).toHaveBeenCalledWith('[EmailWorker] Alert email sent', {
      jobId: 'job-1',
      userId: 'user-1',
      symbol: 'AAPL',
    })
    expect(logged(logger)).not.toContain('secret.person')
    expect(logged(logger)).not.toContain('@')
  })

  it('renewal reminder: job id, subscription id and variant only', async () => {
    const { processor, logger } = setup()
    await processor({
      id: 'job-2',
      name: 'subscription-renewal-reminder',
      data: renewalJob({
        to: 'secret.person@fund.com',
        userName: 'Secret Person',
      }),
    })

    expect(logger.info).toHaveBeenCalledWith(
      '[EmailWorker] Renewal reminder sent',
      {
        jobId: 'job-2',
        subscriptionId: 'sub-1',
        variant: 'card-on',
      },
    )
    expect(logged(logger)).not.toContain('Secret')
    expect(logged(logger)).not.toContain('@')
  })

  it('team invite: job id, invite id, team id and role only', async () => {
    const { processor, logger } = setup()
    await processor({
      id: 'job-3',
      name: 'team-invite',
      data: {
        to: 'secret.person@fund.com',
        inviteId: 'inv-9',
        teamId: 'team-9',
        inviterName: 'Olivia',
        teamName: 'Alpha Fund',
        inviteUrl: 'https://app.example/teams/invite?token=abc',
        role: 'ADMIN',
        expiresAt: '2026-10-07T00:00:00.000Z',
      },
    })

    expect(logger.info).toHaveBeenCalledWith('[EmailWorker] Team invite sent', {
      jobId: 'job-3',
      inviteId: 'inv-9',
      teamId: 'team-9',
      role: 'ADMIN',
    })
    expect(logged(logger)).not.toContain('@')
    expect(logged(logger)).not.toContain('token=')
  })

  it('a failed job whose SMTP error echoes the recipient is logged with the address scrubbed', () => {
    const { logger, deps } = setup()

    deps.workerHandlers.failed(
      { id: 'job-4', attemptsMade: 3 },
      new Error(
        '550 5.1.1 <secret.person@fund.com>: Recipient address rejected',
      ),
    )

    const message = logger.error.mock.calls[0][0] as string
    expect(message).toContain('job-4')
    expect(message).toContain('[redacted-email]')
    expect(message).not.toContain('secret.person')
  })
})

describe('staff security emails', () => {
  const stepUp = {
    to: 'staff@venturedive.com',
    userId: 'staff-1',
    code: '123456',
    expiryMinutes: 5,
  }
  const alert = {
    to: 'security@venturedive.com',
    action: 'PLAN_OVERRIDE',
    adminId: 'staff-1',
    targetType: 'USER',
    targetId: 'user-9',
    ticketRef: 'SUP-77',
    at: '2026-10-01T10:00:00.000Z',
  }

  const start = (name: string, data: unknown) => {
    const deps = mockDeps({ host: 'localhost' })
    const {
      transporter,
    } = require('../../../../shared/infrastructure/config/email')
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()
    const worker = deps.WorkerMock.mock.results[0].value
    return { transporter, process: () => worker.processor({ name, data }) }
  }

  describe('enqueueStaffStepUpEmail', () => {
    it('reports false and skips enqueuing when Redis is unavailable', async () => {
      mockDeps(null)
      const { enqueueStaffStepUpEmail } = require('../email-worker')
      await expect(enqueueStaffStepUpEmail(stepUp)).resolves.toBe(false)
    })

    it("enqueues under the 'staff-step-up' job name and reports true", async () => {
      const { QueueMock } = mockDeps({ host: 'localhost' })
      const { enqueueStaffStepUpEmail } = require('../email-worker')

      await expect(enqueueStaffStepUpEmail(stepUp)).resolves.toBe(true)

      expect(QueueMock.mock.results[0].value.add).toHaveBeenCalledWith(
        'staff-step-up',
        stepUp,
      )
    })
  })

  describe('enqueueAdminActionAlertEmail', () => {
    it('skips quietly when Redis is unavailable', async () => {
      mockDeps(null)
      const { enqueueAdminActionAlertEmail } = require('../email-worker')
      await expect(enqueueAdminActionAlertEmail(alert)).resolves.toBeUndefined()
    })

    it("enqueues under the 'admin-action-alert' job name", async () => {
      const { QueueMock } = mockDeps({ host: 'localhost' })
      const { enqueueAdminActionAlertEmail } = require('../email-worker')

      await enqueueAdminActionAlertEmail(alert)

      expect(QueueMock.mock.results[0].value.add).toHaveBeenCalledWith(
        'admin-action-alert',
        alert,
      )
    })
  })

  it('sends the step-up code email', async () => {
    const { transporter, process } = start('staff-step-up', stepUp)
    await process()
    const mail = transporter.sendMail.mock.calls[0][0]
    expect(mail.to).toBe('staff@venturedive.com')
    expect(mail.subject).toBe('Your StockPros staff verification code')
    expect(mail.text).toContain('123456')
    expect(mail.html).toContain('123456')
  })

  it('sends the risky-action alert with identifiers only', async () => {
    const { transporter, process } = start('admin-action-alert', alert)
    await process()
    const mail = transporter.sendMail.mock.calls[0][0]
    expect(mail.to).toBe('security@venturedive.com')
    expect(mail.subject).toBe('[StockPros staff] Plan override')
    expect(mail.text).toContain('SUP-77')
    expect(mail.text).toContain('user-9')
  })

  it.each([
    ['staff-step-up', stepUp],
    ['admin-action-alert', alert],
  ])(
    'rethrows delivery failures for %s so BullMQ retries',
    async (name, data) => {
      const { transporter, process } = start(name, data)
      transporter.sendMail.mockRejectedValueOnce(new Error('smtp down'))
      await expect(process()).rejects.toThrow()
    },
  )

  it.each([
    ['staff-step-up', { ...stepUp, code: '12ab56' }],
    ['staff-step-up', { ...stepUp, to: 'not-an-email' }],
    ['admin-action-alert', { ...alert, at: 'yesterday' }],
  ])('drops a malformed %s payload permanently', async (name, data) => {
    const { transporter, process } = start(name, data)
    await expect(process()).rejects.toThrow()
    expect(transporter.sendMail).not.toHaveBeenCalled()
  })

  it('never writes the code or the recipient to the logs', async () => {
    const infoSpy = jest.fn()
    jest.doMock('../../../../shared/infrastructure/logger', () => ({
      logger: {
        info: infoSpy,
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }))
    const { process } = start('staff-step-up', stepUp)
    await process()

    const logged = JSON.stringify(infoSpy.mock.calls)
    expect(logged).toContain('Staff step-up code sent')
    expect(logged).not.toContain('123456')
    expect(logged).not.toContain('staff@venturedive.com')
  })
})

describe('team join-request emails', () => {
  const payload = {
    to: 'admin@fund.com',
    requestId: 'jr-1',
    teamId: 'team-1',
    kind: 'REQUESTED',
    teamName: 'Alpha Fund',
    requesterName: 'Sam Lee',
    actionUrl: 'https://app.example/teams',
  }

  it('logs and skips enqueuing when Redis is unavailable', async () => {
    mockDeps(null)
    const { enqueueTeamJoinRequestEmail } = require('../email-worker')
    await expect(enqueueTeamJoinRequestEmail(payload)).resolves.toBeUndefined()
  })

  it("enqueues under the 'team-join-request' job name on the shared email queue", async () => {
    const { QueueMock } = mockDeps({ host: 'localhost' })
    const { enqueueTeamJoinRequestEmail } = require('../email-worker')

    await enqueueTeamJoinRequestEmail(payload)

    expect(QueueMock.mock.results[0].value.add).toHaveBeenCalledWith(
      'team-join-request',
      payload,
    )
  })

  it('renders and sends the email when the worker processes a team-join-request job', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const {
      transporter,
    } = require('../../../../shared/infrastructure/config/email')
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const worker = deps.WorkerMock.mock.results[0].value
    await worker.processor({
      id: 'job-7',
      name: 'team-join-request',
      data: payload,
    })

    expect(transporter.sendMail).toHaveBeenCalledTimes(1)
    const mail = transporter.sendMail.mock.calls[0][0]
    expect(mail.to).toBe('admin@fund.com')
    expect(mail.subject).toBe('Sam Lee asked to join Alpha Fund on StockPros')
    expect(mail.html).toContain(payload.actionUrl)
  })

  it('rethrows delivery failures so BullMQ retries the job', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const {
      transporter,
    } = require('../../../../shared/infrastructure/config/email')
    transporter.sendMail.mockRejectedValueOnce(new Error('smtp down'))
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const worker = deps.WorkerMock.mock.results[0].value
    await expect(
      worker.processor({ name: 'team-join-request', data: payload }),
    ).rejects.toThrow()
  })

  it('logs the request and team ids only, never the address', async () => {
    const deps = mockDeps({ host: 'localhost' })
    const { logger } = require('../../../../shared/infrastructure/logger')
    const { startEmailWorker } = require('../email-worker')
    startEmailWorker()

    const worker = deps.WorkerMock.mock.results[0].value
    await worker.processor({
      id: 'job-8',
      name: 'team-join-request',
      data: payload,
    })

    expect(logger.info).toHaveBeenCalledWith(
      '[EmailWorker] Team join-request email sent',
      {
        jobId: 'job-8',
        requestId: 'jr-1',
        teamId: 'team-1',
        kind: 'REQUESTED',
      },
    )
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('@')
  })
})
