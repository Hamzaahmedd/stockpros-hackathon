import config from '@/config'
import { Prisma, UsageAlertKind } from '@prisma/client'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import { enqueueUsageAlertEmail } from '../notifications/public'
import {
  LOW_BALANCE_SIGNALS,
  OVERAGE_COST_PAISA_PER_SIGNAL,
  QUOTA_WARNING_RATIO,
  SPEND_CAP_WARNING_RATIO,
} from './constants'
import {
  sumCreditSpend,
  UsageSource,
  type MeterActor,
  type MeterQuota,
  type MeterResult,
} from './credits'
import { formatAmount, formatDateUtc } from './format'
import { getMyUsage, type UsageSummary } from './usage'

interface AlertRecipient {
  email: string
  displayName: string
  usageAlertsEnabled: boolean
  creditBalanceInPaisa: number
  monthlyCreditLimitPaisa: number | null
}

/** Allowance warnings fire on the exact signal that crosses the line, so they cost no extra query on the way there. */
const quotaKindsCrossed = ({ used, limit }: MeterQuota): UsageAlertKind[] => {
  const kinds: UsageAlertKind[] = []
  if (used === Math.ceil(limit * QUOTA_WARNING_RATIO)) {
    kinds.push(UsageAlertKind.QUOTA_80)
  }
  if (used === limit) kinds.push(UsageAlertKind.QUOTA_EXHAUSTED)
  return kinds
}

/** Warnings that only matter once credit is being drawn: a low balance, or nearing the personal limit. */
async function creditKindsReached(
  actor: MeterActor,
  user: AlertRecipient,
  quota: MeterQuota,
): Promise<{ kinds: UsageAlertKind[]; spentPaisa: number | null }> {
  const kinds: UsageAlertKind[] = []
  if (
    user.creditBalanceInPaisa <
    LOW_BALANCE_SIGNALS * OVERAGE_COST_PAISA_PER_SIGNAL
  ) {
    kinds.push(UsageAlertKind.LOW_BALANCE)
  }

  const cap = user.monthlyCreditLimitPaisa
  if (cap === null) return { kinds, spentPaisa: null }
  const spentPaisa = await sumCreditSpend(prisma, actor, quota.windowStart)
  if (spentPaisa >= Math.ceil(cap * SPEND_CAP_WARNING_RATIO)) {
    kinds.push(UsageAlertKind.CAP_90)
  }
  return { kinds, spentPaisa }
}

/**
 * Claims each warning for this billing cycle by inserting its row; the unique
 * key makes the insert the lock, so concurrent requests crossing a threshold
 * together send one email, not several. Returns only the kinds this call won.
 */
async function claimAlerts(
  userId: string,
  kinds: UsageAlertKind[],
  windowStart: Date,
): Promise<UsageAlertKind[]> {
  const claimed: UsageAlertKind[] = []
  for (const kind of kinds) {
    const { count } = await prisma.usageAlert.createMany({
      data: [{ userId, kind, windowStart }],
      skipDuplicates: true,
    })
    if (count > 0) claimed.push(kind)
  }
  return claimed
}

async function evaluateUsageAlerts(
  actor: MeterActor,
  result: MeterResult,
): Promise<void> {
  // Workspace members are not emailed yet: their allowance, pool and limits
  // belong to the workspace, so a personal warning would mislead.
  if (actor.membership) return

  const { quota } = result
  const quotaKinds =
    result.source === UsageSource.BASE ? quotaKindsCrossed(quota) : []
  // The common case (a free base signal below 80%) ends here, with no query.
  if (result.source === UsageSource.BASE && quotaKinds.length === 0) return

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: {
      email: true,
      displayName: true,
      usageAlertsEnabled: true,
      creditBalanceInPaisa: true,
      monthlyCreditLimitPaisa: true,
    },
  })
  if (!user?.usageAlertsEnabled) return

  const credit =
    result.source === UsageSource.CREDIT
      ? await creditKindsReached(actor, user, quota)
      : { kinds: [], spentPaisa: null }
  const claimed = await claimAlerts(
    actor.userId,
    [...quotaKinds, ...credit.kinds],
    quota.windowStart,
  )

  for (const kind of claimed) {
    await enqueueUsageAlertEmail({
      to: user.email,
      userId: actor.userId,
      kind,
      userName: user.displayName,
      usedSignals: Math.min(quota.used, quota.limit),
      includedSignals: quota.limit,
      resetsOn: quota.windowEnd
        ? formatDateUtc(quota.windowEnd)
        : 'your next cycle',
      creditBalance: formatAmount(user.creditBalanceInPaisa),
      ...(kind === UsageAlertKind.CAP_90 &&
      user.monthlyCreditLimitPaisa !== null &&
      credit.spentPaisa !== null
        ? {
            spendLimit: formatAmount(user.monthlyCreditLimitPaisa),
            spentSoFar: formatAmount(credit.spentPaisa),
          }
        : {}),
      usageUrl: `${config.server.frontendUrl}/usage`,
    })
    logger.info(`[UsageAlert] Queued ${kind} warning user=${actor.userId}`)
  }
}

/**
 * After a metered AI signal has been counted, emails the user if it crossed a
 * warning line: 80% / 100% of the included signals, a low credit balance, or
 * 90% of their own spending limit. Each goes out once per billing cycle.
 *
 * Never throws and is not awaited by the request: a warning must not slow
 * down or fail the AI call it is about.
 */
export async function notifyUsageThresholds(
  actor: MeterActor,
  result: MeterResult,
): Promise<void> {
  try {
    await evaluateUsageAlerts(actor, result)
  } catch (error) {
    logger.warn(
      `[UsageAlert] Failed to evaluate warnings user=${actor.userId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

/**
 * Forgets the "low balance" warning after a top-up, so the next dip warns
 * again instead of staying silent for the rest of the cycle.
 */
export async function resetLowBalanceAlert(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.usageAlert.deleteMany({
    where: { userId, kind: UsageAlertKind.LOW_BALANCE },
  })
}

/** Turns the caller's usage-warning emails on or off and returns the refreshed usage summary. */
export async function setUsageAlertsEnabled(
  userId: string,
  enabled: boolean,
): Promise<UsageSummary> {
  await prisma.user.update({
    where: { id: userId },
    data: { usageAlertsEnabled: enabled },
  })
  return getMyUsage(userId)
}
