jest.mock('../logger', () => ({ logger: { warn: jest.fn(), info: jest.fn() } }))

const mockClaim = jest.fn()
jest.mock('../alert-throttle', () => ({
  claimAlertSlot: (...args: unknown[]) => mockClaim(...args),
}))

const mockPost = jest.fn()
jest.mock('../chat-webhook', () => ({
  ...jest.requireActual('../chat-webhook'),
  postChatWebhook: (...args: unknown[]) => mockPost(...args),
}))

import config from '@/config'
import { logger } from '../logger'
import { formatOpsAlert, OpsAlertKind, sendOpsAlert } from '../ops-alert'

const URL = 'https://hooks.slack.com/services/T000/B000/SECRET-TOKEN'
const ops = config.opsAlerts as { webhookUrl: string }
const originalUrl = ops.webhookUrl
const ZWSP = String.fromCodePoint(0x200b)

beforeEach(() => {
  jest.clearAllMocks()
  ops.webhookUrl = URL
  mockClaim.mockResolvedValue({ send: true, suppressed: 0 })
  mockPost.mockResolvedValue({ delivered: true })
})

afterAll(() => {
  ops.webhookUrl = originalUrl
})

describe('formatOpsAlert', () => {
  it('states the severity, a fixed sentence and the ids', () => {
    const text = formatOpsAlert(
      {
        kind: OpsAlertKind.JOB_FAILED,
        key: 'email-alerts',
        details: { queue: 'email-alerts', jobId: 42, error: 'TimeoutError' },
      },
      0,
    )
    expect(text).toBe(
      '[WARNING] A background job failed [queue=email-alerts jobId=42 error=TimeoutError]',
    )
  })

  it('marks money problems as critical', () => {
    expect(
      formatOpsAlert(
        { kind: OpsAlertKind.PAYMENT_NEEDS_MANUAL_ACTION, key: 't' },
        0,
      ),
    ).toMatch(/^\[CRITICAL\] A payment needs manual action/)
    expect(
      formatOpsAlert(
        { kind: OpsAlertKind.PAYMENT_WEBHOOK_FAILED, key: 't' },
        0,
      ),
    ).toMatch(/^\[CRITICAL\]/)
    expect(
      formatOpsAlert(
        { kind: OpsAlertKind.PAYMENT_WEBHOOK_REJECTED, key: 't' },
        0,
      ),
    ).toMatch(/^\[WARNING\]/)
  })

  it('reports how many were held back since the last alert', () => {
    expect(
      formatOpsAlert({ kind: OpsAlertKind.JOB_FAILED, key: 'q' }, 12),
    ).toContain('(+12 suppressed since the last alert)')
    expect(
      formatOpsAlert({ kind: OpsAlertKind.JOB_FAILED, key: 'q' }, 0),
    ).not.toContain('suppressed')
  })

  it('drops any detail that is not a plain id, so personal data cannot get through', () => {
    const text = formatOpsAlert(
      {
        kind: OpsAlertKind.RISKY_ADMIN_ACTION,
        key: 'k',
        details: {
          adminId: '0191e4a0-0000-7000-8000-0000000000aa',
          email: 'sam@fund.com',
          name: 'Sam Lee',
          url: 'https://x.example/a',
          message: 'a'.repeat(200),
          empty: '',
          action: 'PLAN_OVERRIDE',
        },
      },
      0,
    )
    expect(text).toContain('adminId=0191e4a0-0000-7000-8000-0000000000aa')
    expect(text).toContain('action=PLAN_OVERRIDE')
    for (const leaked of [
      'sam@fund.com',
      'Sam',
      'x.example',
      'aaaa',
      'email=',
      'name=',
    ]) {
      expect(text).not.toContain(leaked)
    }
  })

  it('defuses mentions in whatever it does print', () => {
    const text = formatOpsAlert(
      { kind: OpsAlertKind.JOB_FAILED, key: 'k', details: { queue: 'a' } },
      0,
    )
    expect(text).not.toMatch(new RegExp(`[@<](?!${ZWSP})`))
  })
})

describe('sendOpsAlert', () => {
  it('posts the alert once, with the configured timeout', async () => {
    await sendOpsAlert({
      kind: OpsAlertKind.JOB_FAILED,
      key: 'email-alerts',
      details: { queue: 'email-alerts' },
    })

    expect(mockClaim).toHaveBeenCalledWith(
      'JOB_FAILED:email-alerts',
      config.opsAlerts.dedupeWindowSeconds,
    )
    expect(mockPost).toHaveBeenCalledWith(
      URL,
      '[WARNING] A background job failed [queue=email-alerts]',
      config.opsAlerts.timeoutMs,
    )
  })

  it('does nothing at all when no webhook is configured', async () => {
    ops.webhookUrl = ''
    await sendOpsAlert({ kind: OpsAlertKind.JOB_FAILED, key: 'q' })
    expect(mockClaim).not.toHaveBeenCalled()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('holds back an alert the throttle says to suppress', async () => {
    mockClaim.mockResolvedValue({ send: false, suppressed: 3 })
    await sendOpsAlert({ kind: OpsAlertKind.JOB_FAILED, key: 'q' })
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('includes the suppressed count when a new window opens', async () => {
    mockClaim.mockResolvedValue({ send: true, suppressed: 9 })
    await sendOpsAlert({ kind: OpsAlertKind.JOB_FAILED, key: 'q' })
    expect(mockPost.mock.calls[0][1]).toContain('(+9 suppressed')
  })

  it('throttles on a safe key, replacing anything that is not a plain id', async () => {
    await sendOpsAlert({
      kind: OpsAlertKind.PAYMENT_NEEDS_MANUAL_ACTION,
      key: 'sam@fund.com',
    })
    expect(mockClaim.mock.calls[0][0]).toBe(
      'PAYMENT_NEEDS_MANUAL_ACTION:unknown',
    )
  })

  it('logs a refused delivery by kind and status, never the URL', async () => {
    mockPost.mockResolvedValue({ delivered: false, status: 429 })
    await sendOpsAlert({ kind: OpsAlertKind.JOB_FAILED, key: 'q' })
    expect(logger.warn).toHaveBeenCalledWith(
      '[OpsAlert] delivery failed kind=JOB_FAILED status=429',
    )
  })

  it('logs a failed delivery by kind and failure, never the URL', async () => {
    mockPost.mockResolvedValue({ delivered: false, failure: 'TimeoutError' })
    await sendOpsAlert({ kind: OpsAlertKind.JOB_FAILED, key: 'q' })
    expect(logger.warn).toHaveBeenCalledWith(
      '[OpsAlert] delivery failed kind=JOB_FAILED kind=TimeoutError',
    )
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain(
      'SECRET-TOKEN',
    )
  })

  it('never throws, even when the throttle or the sender blows up', async () => {
    mockClaim.mockRejectedValueOnce(new RangeError('boom'))
    await expect(
      sendOpsAlert({ kind: OpsAlertKind.JOB_FAILED, key: 'q' }),
    ).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith(
      '[OpsAlert] could not send kind=JOB_FAILED: RangeError',
    )

    mockClaim.mockRejectedValueOnce('not an error')
    await expect(
      sendOpsAlert({ kind: OpsAlertKind.JOB_FAILED, key: 'q' }),
    ).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenLastCalledWith(
      '[OpsAlert] could not send kind=JOB_FAILED: unknown',
    )
  })
})
