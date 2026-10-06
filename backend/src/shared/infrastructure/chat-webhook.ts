const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)

/**
 * Text that reaches a chat channel must not ping people or inject links:
 * "@everyone", "@here", "<!channel>", "<@U123>" and "<url|label>" all start
 * with "@" or "<", so a zero-width space after each defuses them without
 * changing how it reads.
 */
export const neutralizeMentions = (text: string): string =>
  text
    .replaceAll('@', `@${ZERO_WIDTH_SPACE}`)
    .replaceAll('<', `<${ZERO_WIDTH_SPACE}`)

const isDiscord = (url: string): boolean =>
  /(^|\.)discord(app)?\.com$/i.test(new URL(url).hostname)

/** Slack reads `text`, Discord reads `content`; each ignores the other's field. */
export const buildChatPayload = (url: string, text: string): object =>
  isDiscord(url) ? { content: text, allowed_mentions: { parse: [] } } : { text }

export type ChatPostResult =
  | { delivered: true }
  /** The chat service answered with a non-2xx status. */
  | { delivered: false; status: number }
  /** No answer: the kind of failure (e.g. "TimeoutError"), never its message, which can hold the URL. */
  | { delivered: false; failure: string }

/**
 * Posts one message to a Slack or Discord incoming webhook. Never throws.
 * It does not follow redirects (they could leave the allowed hosts) and gives
 * up after `timeoutMs`. Callers decide what to log, and must never log `url`
 * (it carries a token).
 */
export async function postChatWebhook(
  url: string,
  text: string,
  timeoutMs: number,
): Promise<ChatPostResult> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildChatPayload(url, text)),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return response.ok
      ? { delivered: true }
      : { delivered: false, status: response.status }
  } catch (err) {
    return {
      delivered: false,
      failure: err instanceof Error ? err.name : 'unknown',
    }
  }
}
