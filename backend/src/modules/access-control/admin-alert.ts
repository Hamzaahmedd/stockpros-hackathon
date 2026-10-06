import config from '@/config'
import { AdminAuditAction } from '@prisma/client'
import { z } from 'zod'
import { logger } from '../../shared/infrastructure/logger'
import {
  OpsAlertKind,
  sendOpsAlert,
} from '../../shared/infrastructure/ops-alert'
import { enqueueAdminActionAlertEmail } from '../notifications/public'
import type { AdminTargetType } from './admin-audit'

/** Alert-only event for a staff member who exhausted their step-up attempts. */
export const STEP_UP_LOCKOUT_ALERT = 'STEP_UP_LOCKOUT'

/**
 * Staff actions that warrant telling someone straight away. Credit adjustments
 * qualify only above `config.admin.alertCreditThresholdPaisa`. This set is also
 * the natural scope for a future two-person approval rule.
 */
export const RISKY_ADMIN_ACTIONS: ReadonlySet<string> = new Set([
  AdminAuditAction.PLAN_OVERRIDE,
  AdminAuditAction.USER_SESSION_INVALIDATED,
  AdminAuditAction.EMERGENCY_MARKET_TOGGLED,
  AdminAuditAction.MEMBER_FORCE_REMOVED,
  AdminAuditAction.AUTH_POLICY_RESET,
  AdminAuditAction.SAML_DISABLED,
  AdminAuditAction.SAML_CONFIG_RESET,
  // Changes what every user sees, or what one customer is allowed to spend.
  AdminAuditAction.ANNOUNCEMENT_KILL_SWITCH_TOGGLED,
  AdminAuditAction.SPEND_LIMIT_OVERRIDDEN,
  STEP_UP_LOCKOUT_ALERT,
])

export interface AdminAlertEvent {
  adminId: string
  action: AdminAuditAction | typeof STEP_UP_LOCKOUT_ALERT
  targetType: AdminTargetType
  targetId: string
  ticketRef?: string
  /** Signed paisa, for credit adjustments (compared by magnitude to the threshold). */
  amountPaisa?: number
  /** What happened, for the ops channel only (e.g. "DISABLED"); a plain id-like word. */
  outcome?: string
}

// Fail at boot on a typo rather than silently alerting nobody.
z.array(z.string().email()).parse(config.admin.alertEmails)

const isAlertWorthy = (event: AdminAlertEvent): boolean => {
  if (event.action === AdminAuditAction.CREDIT_INJECTION) {
    return (
      Math.abs(event.amountPaisa ?? 0) >= config.admin.alertCreditThresholdPaisa
    )
  }
  return RISKY_ADMIN_ACTIONS.has(event.action)
}

/**
 * Emails the configured security recipients. Identifiers only (no customer
 * data). Never throws: every problem is logged.
 */
async function emailSecurityRecipients(event: AdminAlertEvent): Promise<void> {
  try {
    const recipients = config.admin.alertEmails
    if (recipients.length === 0) return

    const at = new Date().toISOString()
    await Promise.all(
      recipients.map((to) =>
        enqueueAdminActionAlertEmail({
          to,
          action: event.action,
          adminId: event.adminId,
          targetType: event.targetType,
          targetId: event.targetId,
          ticketRef: event.ticketRef,
          at,
        }),
      ),
    )
    logger.info('[Admin] risky action alert queued', {
      action: event.action,
      recipients: recipients.length,
    })
  } catch (err) {
    logger.warn(`[Admin] could not queue a risky action alert: ${String(err)}`)
  }
}

/** Posts to the ops chat channel: ids only, and repeated alerts for the same target are throttled together. */
const notifyOpsChannel = (event: AdminAlertEvent): Promise<void> =>
  sendOpsAlert({
    kind: OpsAlertKind.RISKY_ADMIN_ACTION,
    key: `${event.action}:${event.targetId}`,
    details: {
      action: event.action,
      adminId: event.adminId,
      targetType: event.targetType,
      targetId: event.targetId,
      ...(event.ticketRef ? { ticketRef: event.ticketRef } : {}),
      ...(event.outcome ? { outcome: event.outcome } : {}),
    },
  })

/**
 * Tells people about a risky staff action, by email to the configured
 * security recipients and in the ops chat channel. The two are independent: an
 * empty recipient list or a chat outage never stops the other. Fire-and-forget
 * by design: it runs after the action committed and must never fail or slow
 * the request, so every problem is logged, not thrown.
 */
export async function alertAdminAction(event: AdminAlertEvent): Promise<void> {
  if (!isAlertWorthy(event)) return
  // allSettled: one channel failing must never stop the other or surface to the caller.
  await Promise.allSettled([
    emailSecurityRecipients(event),
    notifyOpsChannel(event),
  ])
}
