jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn() },
}))

import config from '@/config'
import { logger } from '../../../shared/infrastructure/logger'
import {
  buildAlertText,
  sendFeedbackWebhook,
  toSnippet,
  type FeedbackAlert,
} from '../webhook'

const SLACK = 'https://hooks.slack.com/services/T000/B000/SECRET-TOKEN'
const DISCORD = 'https://discord.com/api/webhooks/123/SECRET-TOKEN'

const alert = (overrides: Partial<FeedbackAlert> = {}): FeedbackAlert => ({
  id: 'f1',
  category: 'BUG',
  message: 'The chart does not load',
  page: '/forecast',
  planTier: 'PRO',
  ...overrides,
})

const feedback = config.feedback as { webhookUrl: string }
const originalUrl = feedback.webhookUrl
const fetchMock = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  feedback.webhookUrl = SLACK
  fetchMock.mockResolvedValue({ ok: true, status: 200 })
  global.fetch = fetchMock as unknown as typeof fetch
})

afterAll(() => {
  feedback.webhookUrl = originalUrl
})

describe('toSnippet', () => {
  it('collapses whitespace and cuts to the limit with an ellipsis', () => {
    expect(toSnippet('a\n\n  b\tc', 200)).toBe('a b c')
    expect(toSnippet('x'.repeat(250), 200)).toBe(`${'x'.repeat(200)}…`)
    expect(toSnippet('x'.repeat(200), 200)).toBe('x'.repeat(200))
  })
})

describe('buildAlertText', () => {
  it('names the category, plan, page, a truncated snippet and the id, but no identity', () => {
    const text = buildAlertText(alert({ message: 'y'.repeat(500) }), 200)
    expect(text).toContain('New bug report (PRO plan)')
    expect(text).toContain('on /forecast')
    expect(text).toContain(`"${'y'.repeat(200)}…"`)
    expect(text).toContain('[id f1]')
    expect(text).not.toMatch(/@|email|user/i)
  })

  it('copes with no category and no page', () => {
    const text = buildAlertText(alert({ category: null, page: null }), 200)
    expect(text).toContain('New feedback (PRO plan):')
    expect(text).not.toContain(' on ')
  })

  it.each([
    ['FEATURE_REQUEST', 'feature request'],
    ['GENERAL', 'general feedback'],
  ] as const)('labels %s', (category, label) => {
    expect(buildAlertText(alert({ category }), 200)).toContain(`New ${label}`)
  })

  it('neutralizes mentions in the message and the page', () => {
    const text = buildAlertText(
      alert({ message: '@everyone look', page: '/<!here>' }),
      200,
    )
    expect(text).not.toMatch(/@(?!​)/)
    expect(text).not.toMatch(/<(?!​)/)
  })
})

describe('sendFeedbackWebhook', () => {
  it('posts the alert to the configured URL without following redirects', async () => {
    await sendFeedbackWebhook(alert())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(SLACK)
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('error')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init.body).text).toContain('The chart does not load')
  })

  it('does nothing when no webhook is configured', async () => {
    feedback.webhookUrl = ''
    await sendFeedbackWebhook(alert())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the Discord shape to a Discord URL', async () => {
    feedback.webhookUrl = DISCORD
    await sendFeedbackWebhook(alert())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      allowed_mentions: { parse: [] },
    })
  })

  it('logs a rejection by id and status, and does not throw', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 })
    await expect(sendFeedbackWebhook(alert())).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith(
      '[Feedback] webhook rejected feedbackId=f1 status=429',
    )
  })

  it('swallows a network failure and logs only the id and the kind of failure', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new TypeError(`fetch failed for ${SLACK}`), {}),
    )

    await expect(sendFeedbackWebhook(alert())).resolves.toBeUndefined()

    const logged = (logger.warn as jest.Mock).mock.calls[0][0] as string
    expect(logged).toBe(
      '[Feedback] webhook failed feedbackId=f1 kind=TypeError',
    )
    expect(logged).not.toContain('SECRET-TOKEN')
    expect(logged).not.toContain('chart')
  })

  it('swallows a timeout', async () => {
    const timeout = Object.assign(new Error('timed out'), {
      name: 'TimeoutError',
    })
    fetchMock.mockRejectedValue(timeout)
    await expect(sendFeedbackWebhook(alert())).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith(
      '[Feedback] webhook failed feedbackId=f1 kind=TimeoutError',
    )
  })

  it('copes with a thrown value that is not an Error', async () => {
    fetchMock.mockRejectedValue('boom')
    await expect(sendFeedbackWebhook(alert())).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith(
      '[Feedback] webhook failed feedbackId=f1 kind=unknown',
    )
  })

  it('never logs the URL or the message on success paths either', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    await sendFeedbackWebhook(alert())
    const all = JSON.stringify((logger.warn as jest.Mock).mock.calls)
    expect(all).not.toContain('SECRET-TOKEN')
    expect(all).not.toContain('chart')
  })
})
