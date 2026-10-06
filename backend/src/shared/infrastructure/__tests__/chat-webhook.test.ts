import {
  buildChatPayload,
  neutralizeMentions,
  postChatWebhook,
} from '../chat-webhook'

const ZWSP = String.fromCodePoint(0x200b)
const SLACK = 'https://hooks.slack.com/services/T000/B000/SECRET-TOKEN'
const DISCORD = 'https://discord.com/api/webhooks/123/SECRET-TOKEN'

const fetchMock = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  fetchMock.mockResolvedValue({ ok: true, status: 200 })
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('neutralizeMentions', () => {
  it('defuses channel pings, user pings and link syntax without changing the look', () => {
    const input = '@everyone @here <!channel> <@U123> <http://x|y>'
    const out = neutralizeMentions(input)

    expect(out).not.toMatch(new RegExp(`@(?!${ZWSP})`))
    expect(out).not.toMatch(new RegExp(`<(?!${ZWSP})`))
    expect(out.replaceAll(ZWSP, '')).toBe(input)
  })

  it('leaves ordinary text alone', () => {
    expect(neutralizeMentions('Queue email-alerts failed')).toBe(
      'Queue email-alerts failed',
    )
  })
})

describe('buildChatPayload', () => {
  it('uses text for Slack', () => {
    expect(buildChatPayload(SLACK, 'hi')).toEqual({ text: 'hi' })
  })

  it.each([
    DISCORD,
    'https://discordapp.com/api/webhooks/1/x',
    'https://canary.discord.com/api/webhooks/1/x',
  ])('uses content and blocks every mention for Discord (%s)', (url) => {
    expect(buildChatPayload(url, 'hi')).toEqual({
      content: 'hi',
      allowed_mentions: { parse: [] },
    })
  })
})

describe('postChatWebhook', () => {
  it('posts JSON to the URL without following redirects, with a timeout', async () => {
    await expect(postChatWebhook(SLACK, 'hello', 3000)).resolves.toEqual({
      delivered: true,
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(SLACK)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.redirect).toBe('error')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init.body)).toEqual({ text: 'hello' })
  })

  it('reports the status when the service refuses it', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 })
    await expect(postChatWebhook(SLACK, 'x', 3000)).resolves.toEqual({
      delivered: false,
      status: 429,
    })
  })

  it('never throws: a failure is reported by kind, without the message (which can hold the URL)', async () => {
    fetchMock.mockRejectedValue(new TypeError(`fetch failed for ${SLACK}`))

    const result = await postChatWebhook(SLACK, 'x', 3000)

    expect(result).toEqual({ delivered: false, failure: 'TypeError' })
    expect(JSON.stringify(result)).not.toContain('SECRET-TOKEN')
  })

  it('reports a timeout and a thrown non-Error', async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('slow'), { name: 'TimeoutError' }),
    )
    expect(await postChatWebhook(SLACK, 'x', 3000)).toEqual({
      delivered: false,
      failure: 'TimeoutError',
    })

    fetchMock.mockRejectedValueOnce('boom')
    expect(await postChatWebhook(SLACK, 'x', 3000)).toEqual({
      delivered: false,
      failure: 'unknown',
    })
  })
})
