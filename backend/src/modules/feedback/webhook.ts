import config from '@/config'
import type { FeedbackCategory, PlanTier } from '@prisma/client'
import {
  neutralizeMentions,
  postChatWebhook,
} from '../../shared/infrastructure/chat-webhook'
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

  const result = await postChatWebhook(
    webhookUrl,
    buildAlertText(alert, webhookSnippetChars),
    webhookTimeoutMs,
  )
  if (result.delivered) return

  if ('status' in result) {
    logger.warn(
      `[Feedback] webhook rejected feedbackId=${alert.id} status=${result.status}`,
    )
  } else {
    logger.warn(
      `[Feedback] webhook failed feedbackId=${alert.id} kind=${result.failure}`,
    )
  }
}
