import config from '@/config'
import { claimAlertSlot } from './alert-throttle'
import { neutralizeMentions, postChatWebhook } from './chat-webhook'
import { logger } from './logger'

export enum OpsAlertKind {
  PAYMENT_WEBHOOK_REJECTED = 'PAYMENT_WEBHOOK_REJECTED',
  PAYMENT_NEEDS_MANUAL_ACTION = 'PAYMENT_NEEDS_MANUAL_ACTION',
  PAYMENT_WEBHOOK_FAILED = 'PAYMENT_WEBHOOK_FAILED',
  JOB_FAILED = 'JOB_FAILED',
  RISKY_ADMIN_ACTION = 'RISKY_ADMIN_ACTION',
}

export enum OpsAlertSeverity {
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

interface AlertCopy {
  severity: OpsAlertSeverity
  /** A fixed sentence. Alerts never carry free text, only this plus ids. */
  title: string
}

const ALERT_COPY: Readonly<Record<OpsAlertKind, AlertCopy>> = {
  [OpsAlertKind.PAYMENT_WEBHOOK_REJECTED]: {
    severity: OpsAlertSeverity.WARNING,
    title: 'Payment webhook rejected: invalid signature',
  },
  [OpsAlertKind.PAYMENT_NEEDS_MANUAL_ACTION]: {
    severity: OpsAlertSeverity.CRITICAL,
    title: 'A payment needs manual action (money taken, nothing delivered)',
  },
  [OpsAlertKind.PAYMENT_WEBHOOK_FAILED]: {
    severity: OpsAlertSeverity.CRITICAL,
    title:
      'Payment webhook processing failed (a paid user may not be upgraded)',
  },
  [OpsAlertKind.JOB_FAILED]: {
    severity: OpsAlertSeverity.WARNING,
    title: 'A background job failed',
  },
  [OpsAlertKind.RISKY_ADMIN_ACTION]: {
    severity: OpsAlertSeverity.WARNING,
    title: 'Risky staff action',
  },
}

/**
 * Ids, enum names and error class names only: no spaces, no "@", no "/".
 * An email address, a name, a URL or a sentence cannot pass, so personal data
 * cannot reach the channel by accident.
 */
const SAFE_VALUE = /^[A-Za-z0-9_.:-]{1,80}$/

export type OpsAlertDetails = Readonly<Record<string, string | number>>

export interface OpsAlert {
  kind: OpsAlertKind
  /** What this alert is about (a queue, a team id...). Alerts with the same kind and key share a throttle window. */
  key: string
  details?: OpsAlertDetails
}

const safe = (value: string | number): string | null => {
  const text = String(value)
  return SAFE_VALUE.test(text) ? text : null
}

export const formatOpsAlert = (alert: OpsAlert, suppressed: number): string => {
  const { severity, title } = ALERT_COPY[alert.kind]
  const parts = Object.entries(alert.details ?? {})
    .map(([name, value]) => [name, safe(value)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null)
    .map(([name, value]) => `${name}=${value}`)
  const held =
    suppressed > 0 ? ` (+${suppressed} suppressed since the last alert)` : ''
  const detail = parts.length > 0 ? ` [${parts.join(' ')}]` : ''
  return neutralizeMentions(`[${severity}] ${title}${detail}${held}`)
}

/**
 * Tells the ops channel something needs attention. Best effort and never
 * throws: it runs next to code that has already done its work (or is already
 * failing), so a chat problem must not change the outcome.
 *
 * The log line at the call site stays the system of record; this is a pointer
 * to it. Storm control: one alert per kind and key per window, with a count of
 * what was held back reported on the next one. Does nothing when
 * OPS_ALERT_WEBHOOK_URL is not set.
 */
export async function sendOpsAlert(alert: OpsAlert): Promise<void> {
  const { webhookUrl, timeoutMs, dedupeWindowSeconds } = config.opsAlerts
  if (!webhookUrl) return

  try {
    const key = safe(alert.key) ?? 'unknown'
    const slot = await claimAlertSlot(
      `${alert.kind}:${key}`,
      dedupeWindowSeconds,
    )
    if (!slot.send) return

    const result = await postChatWebhook(
      webhookUrl,
      formatOpsAlert({ ...alert, key }, slot.suppressed),
      timeoutMs,
    )
    if (!result.delivered) {
      const reason =
        'status' in result
          ? `status=${result.status}`
          : `kind=${result.failure}`
      logger.warn(`[OpsAlert] delivery failed kind=${alert.kind} ${reason}`)
    }
  } catch (err) {
    logger.warn(
      `[OpsAlert] could not send kind=${alert.kind}: ${err instanceof Error ? err.name : 'unknown'}`,
    )
  }
}
