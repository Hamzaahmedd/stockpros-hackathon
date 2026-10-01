import config from '@/config'
import { AdminAuditAction } from '@prisma/client'
import { z } from 'zod'
import { logger } from '../../shared/infrastructure/logger'
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
 * Emails the configured security recipients about a risky staff action.
 * Identifiers only (no customer data); fire-and-forget by design: it runs after
 * the action committed and must never fail or slow the request, so every
 * problem is logged, not thrown.
 */
export async function alertAdminAction(event: AdminAlertEvent): Promise<void> {
  try {
    const recipients = config.admin.alertEmails
    if (recipients.length === 0 || !isAlertWorthy(event)) return

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
