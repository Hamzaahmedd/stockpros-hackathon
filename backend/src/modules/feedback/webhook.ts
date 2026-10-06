import config from '@/config'
import type { FeedbackCategory, PlanTier } from '@prisma/client'
import { logger } from '../../shared/infrastructure/logger'

export interface FeedbackAlert {
  id: string
  category: FeedbackCategory | null
  message: string
  page: string | null
  planTier: PlanTier
}

const CATEGORY_LABELS: Readonly<Record<FeedbackCategory, string>> = {
  BUG: 'Bug report',
  FEATURE_REQUEST: 'Feature request',
  GENERAL: 'General feedback',
}

const ZERO_WIDTH_SPACE = '​'

/**
 * User text must not ping a channel or inject links: "@everyone", "@here",
 * "<!channel>", "<@U123>" and "<url|label>" all start with "@" or "<", so a
 * zero-width space after each defuses them without changing how it reads.
 */
export const neutralizeMentions = (text: string): string =>
  text
    .replaceAll('@', `@${ZERO_WIDTH_SPACE}`)
    .replaceAll('<', `<${ZERO_WIDTH_SPACE}`)

/** One line of the user's message: whitespace collapsed, cut to `max` characters. */
export const toSnippet = (message: string, max: number): string => {
  const flat = message.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat
}

export const buildAlertText = (alert: FeedbackAlert, snippetChars: number) => {
  const label = alert.category ? CATEGORY_LABELS[alert.category] : 'Feedback'
  const where = alert.page ? ` on ${alert.page}` : ''
  const quoted = neutralizeMentions(toSnippet(alert.message, snippetChars))
  return `New ${label.toLowerCase()} (${alert.planTier} plan)${neutralizeMentions(where)}: "${quoted}" [id ${alert.id}]`
}

const isDiscord = (url: string): boolean =>
  /(^|\.)discord(app)?\.com$/i.test(new URL(url).hostname)

/** Slack reads `text`, Discord reads `content`; each ignores the other's field. */
export const buildPayload = (url: string, text: string): object =>
  isDiscord(url) ? { content: text, allowed_mentions: { parse: [] } } : { text }

/**
 * Pings the configured Slack/Discord webhook about a new piece of feedback.
 * Best effort and never throws: it runs after the row is saved, so a chat
 * outage must not fail or slow the user's request. Failures are logged by
 * feedback id and failure kind only: never the URL (it holds a token) or the
 * message. The alert carries no name or email.
 */
export async function sendFeedbackWebhook(alert: FeedbackAlert): Promise<void> {
  const { webhookUrl, webhookTimeoutMs, webhookSnippetChars } = config.feedback
  if (!webhookUrl) return

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildPayload(webhookUrl, buildAlertText(alert, webhookSnippetChars)),
      ),
      // A webhook answers directly; following a redirect could leave the allowed hosts.
      redirect: 'error',
      signal: AbortSignal.timeout(webhookTimeoutMs),
    })
    if (!response.ok) {
      logger.warn(
        `[Feedback] webhook rejected feedbackId=${alert.id} status=${response.status}`,
      )
    }
  } catch (err) {
    const kind = err instanceof Error ? err.name : 'unknown'
    logger.warn(`[Feedback] webhook failed feedbackId=${alert.id} kind=${kind}`)
  }
}
