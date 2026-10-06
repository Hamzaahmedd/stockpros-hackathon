import { PlanTier } from '@prisma/client'
import { prisma } from '../../shared/infrastructure/database'
import {
  getActiveMembership,
  isTeamAdminRole,
} from '../../shared/infrastructure/team-access'
import {
  MeteredFeature,
  OVERAGE_COST_PAISA_PER_SIGNAL,
  PRO_MONTHLY_AI_SIGNALS,
  TEAM_MONTHLY_AI_SIGNALS,
} from './constants'
import {
  resolveUsageWindow,
  sumCreditSpend,
  UsageWindowSource,
  type MeterActor,
} from './credits'

export enum CreditPool {
  USER = 'USER',
  TEAM = 'TEAM',
}

export interface UsageSummary {
  plan: PlanTier
  /**
   * False for FREE, which is governed by daily per-feature quotas instead of a
   * monthly allowance — there is no meter to show.
   */
  metered: boolean
  quota: {
    limit: number
    used: number
    remaining: number
    windowStart: Date
    /** When the allowance resets; null only if it cannot be determined. May be in the past during a grace period. */
    windowEnd: Date | null
    windowSource: UsageWindowSource
  } | null
  credits: {
    pool: CreditPool
    balanceInPaisa: number
    costPerSignalPaisa: number
    /** Whole signals the balance can still pay for. */
    signalsAvailable: number
    /** Whether this caller may buy credits for that pool (false for plain team members). */
    canTopUp: boolean
    /** Whether this caller sets their own spending limit (individual Pro); members' limits are set by workspace admins. */
    canSetSpendCap: boolean
  } | null
  /** Whether usage-warning emails are on for this user (individuals receive them; workspace members do not yet). */
  alertsEnabled: boolean
  /** Present only when a monthly credit cap applies: the member's (set by an admin) or the individual's own. */
  spendCap: {
    monthlyLimitPaisa: number
    spentPaisa: number
    remainingPaisa: number
  } | null
}

const AI_SIGNAL_FEATURES: MeteredFeature[] = Object.values(MeteredFeature)

/**
 * The caller's allowance for the current cycle: signals used vs. included,
 * the credit pool that pays for anything beyond it, and (for capped team
 * members) how much of their cap is left. Uses the same window and counting
 * rules as `consumeAiSignal`, so the meter matches what enforcement does.
 */
export async function getMyUsage(userId: string): Promise<UsageSummary> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      plan: true,
      creditBalanceInPaisa: true,
      monthlyCreditLimitPaisa: true,
      usageAlertsEnabled: true,
    },
  })

  if (user.plan === PlanTier.FREE) {
    return {
      plan: user.plan,
      metered: false,
      quota: null,
      credits: null,
      alertsEnabled: user.usageAlertsEnabled,
      spendCap: null,
    }
  }

  const membership = await getActiveMembership(userId)
  const actor: MeterActor = { userId, membership }
  const window = await resolveUsageWindow(actor)

  const [used, pool] = await Promise.all([
    prisma.usageEvent.count({
      where: {
        userId,
        feature: { in: AI_SIGNAL_FEATURES },
        createdAt: { gte: window.start },
      },
    }),
    membership
      ? prisma.team.findUniqueOrThrow({
          where: { id: membership.teamId },
          select: { creditBalanceInPaisa: true },
        })
      : Promise.resolve({ creditBalanceInPaisa: user.creditBalanceInPaisa }),
  ])

  const limit = membership ? TEAM_MONTHLY_AI_SIGNALS : PRO_MONTHLY_AI_SIGNALS

  let spendCap: UsageSummary['spendCap'] = null
  const cap = membership
    ? membership.monthlyCreditLimitPaisa
    : user.monthlyCreditLimitPaisa
  if (cap != null) {
    const spentPaisa = await sumCreditSpend(prisma, actor, window.start)
    spendCap = {
      monthlyLimitPaisa: cap,
      spentPaisa,
      remainingPaisa: Math.max(cap - spentPaisa, 0),
    }
  }

  return {
    plan: user.plan,
    metered: true,
    quota: {
      limit,
      used,
      remaining: Math.max(limit - used, 0),
      windowStart: window.start,
      windowEnd: window.end,
      windowSource: window.source,
    },
    credits: {
      pool: membership ? CreditPool.TEAM : CreditPool.USER,
      balanceInPaisa: pool.creditBalanceInPaisa,
      costPerSignalPaisa: OVERAGE_COST_PAISA_PER_SIGNAL,
      signalsAvailable: Math.floor(
        pool.creditBalanceInPaisa / OVERAGE_COST_PAISA_PER_SIGNAL,
      ),
      canTopUp: !membership || isTeamAdminRole(membership.role),
      canSetSpendCap: !membership,
    },
    alertsEnabled: user.usageAlertsEnabled,
    spendCap,
  }
}
