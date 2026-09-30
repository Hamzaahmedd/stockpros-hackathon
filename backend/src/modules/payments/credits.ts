import { CreditLedgerType, Prisma } from '@prisma/client'
import { OverageReason, OverageRequiredError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import {
  isTeamAdminRole,
  type ActiveMembership,
} from '../../shared/infrastructure/team-access'
import {
  MeteredFeature,
  OVERAGE_COST_PAISA_PER_SIGNAL,
  PRO_MONTHLY_AI_SIGNALS,
  TEAM_MONTHLY_AI_SIGNALS,
} from './constants'

export interface MeterActor {
  userId: string
  membership: ActiveMembership | null
}

export enum UsageSource {
  BASE = 'BASE',
  CREDIT = 'CREDIT',
}

export interface MeterResult {
  source: UsageSource
  costPaisa: number
}

const AI_SIGNAL_FEATURES: MeteredFeature[] = Object.values(MeteredFeature)

const startOfUtcMonth = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

const startOfNextUtcMonth = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

export enum UsageWindowSource {
  SUBSCRIPTION_PERIOD = 'SUBSCRIPTION_PERIOD',
  CALENDAR_MONTH = 'CALENDAR_MONTH',
}

export interface UsageWindow {
  start: Date
  /** When the allowance resets. In a grace period this is already in the past. */
  end: Date | null
  source: UsageWindowSource
}

/**
 * Start of the window the base quota is measured over: the active
 * subscription's billing cycle, so a user gets their full quota aligned to
 * what they paid for. Only a lower bound is applied — once the cycle lapses
 * into the grace period the same window keeps counting, so a lapsed period
 * never hands out a fresh quota. Without a subscription (Bypass Mode) it
 * falls back to the calendar month (UTC).
 */
export async function resolveUsageWindow(
  actor: MeterActor,
  now: Date = new Date(),
): Promise<UsageWindow> {
  const subscription = await prisma.subscription.findUnique({
    where: actor.membership
      ? { teamId: actor.membership.teamId }
      : { userId: actor.userId },
    select: { currentPeriodStart: true, currentPeriodEnd: true },
  })
  if (subscription?.currentPeriodEnd) {
    return {
      start: subscription.currentPeriodStart,
      end: subscription.currentPeriodEnd,
      source: UsageWindowSource.SUBSCRIPTION_PERIOD,
    }
  }
  return {
    start: startOfUtcMonth(now),
    end: startOfNextUtcMonth(now),
    source: UsageWindowSource.CALENDAR_MONTH,
  }
}

/** Just the start of {@link resolveUsageWindow}, which is all enforcement needs. */
export async function resolveUsageWindowStart(
  actor: MeterActor,
  now: Date = new Date(),
): Promise<Date> {
  return (await resolveUsageWindow(actor, now)).start
}

/** Records a usage event (analytics, and base-quota counting when metered). Pass `client` to join a transaction. */
export async function recordUsage(
  actor: MeterActor,
  feature: string,
  symbol?: string,
  costPaisa = 0,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await client.usageEvent.create({
    data: {
      userId: actor.userId,
      teamId: actor.membership?.teamId,
      feature,
      symbol: symbol?.toUpperCase(),
      costPaisa,
    },
  })
}

const canTopUp = (membership: ActiveMembership | null): boolean =>
  !membership || isTeamAdminRole(membership.role)

const rejection = (reason: OverageReason, feature: string, actor: MeterActor) =>
  new OverageRequiredError({
    reason,
    feature,
    canTopUp: canTopUp(actor.membership),
  })

/**
 * Serialises metering for one user. A plain transaction is not enough: under
 * Postgres's default READ COMMITTED isolation two concurrent transactions can
 * both read "299 used" and both insert. A transaction-scoped advisory lock
 * makes the second one wait until the first commits, so it then sees 300 and
 * takes the credit path instead. Released automatically at commit/rollback.
 * (`$executeRaw`, not `$queryRaw`: the lock function returns `void`, which
 * Prisma cannot deserialise as a result column.)
 */
const lockUserMetering = async (
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> => {
  const lockKey = 'metering:' + userId
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
}

/**
 * Unified spend-check sequence for one metered AI action, run as a single
 * transaction under a per-user lock so concurrent requests cannot overshoot
 * the quota, the member spend cap, or the credit balance:
 *   1. base quota (PRO / TEAM seat) within the billing cycle -> allow;
 *   2. team members: per-user monthly credit cap;
 *   3. credit pool balance (user for PRO, team for members);
 *   4. atomic deduction + ledger entry -> allow;
 *   5. otherwise 403 OVERAGE_REQUIRED (nothing is written).
 */
export async function consumeAiSignal(
  actor: MeterActor,
  feature: MeteredFeature,
  symbol?: string,
): Promise<MeterResult> {
  // Read-only lookup, safe outside the transaction.
  const windowStart = await resolveUsageWindowStart(actor)
  const baseLimit = actor.membership
    ? TEAM_MONTHLY_AI_SIGNALS
    : PRO_MONTHLY_AI_SIGNALS

  return prisma.$transaction(async (tx) => {
    await lockUserMetering(tx, actor.userId)

    const used = await tx.usageEvent.count({
      where: {
        userId: actor.userId,
        feature: { in: AI_SIGNAL_FEATURES },
        createdAt: { gte: windowStart },
      },
    })
    if (used < baseLimit) {
      await recordUsage(actor, feature, symbol, 0, tx)
      return { source: UsageSource.BASE, costPaisa: 0 }
    }

    return consumeCredit(tx, actor, feature, symbol, windowStart)
  })
}

/** Steps 2–5 of the sequence, inside the caller's transaction and lock. */
async function consumeCredit(
  tx: Prisma.TransactionClient,
  actor: MeterActor,
  feature: MeteredFeature,
  symbol: string | undefined,
  windowStart: Date,
): Promise<MeterResult> {
  const cost = OVERAGE_COST_PAISA_PER_SIGNAL
  const { membership } = actor

  const cap = membership?.monthlyCreditLimitPaisa
  if (membership && cap != null) {
    const spent = await tx.creditLedger.aggregate({
      _sum: { amountPaisa: true },
      where: {
        userId: actor.userId,
        teamId: membership.teamId,
        type: CreditLedgerType.OVERAGE_CONSUMPTION,
        createdAt: { gte: windowStart },
      },
    })
    // Consumption rows are stored negative.
    const spentPaisa = -(spent._sum.amountPaisa ?? 0)
    if (spentPaisa + cost > cap) {
      throw rejection(OverageReason.SPEND_LIMIT_REACHED, feature, actor)
    }
  }

  const { count } = membership
    ? await tx.team.updateMany({
        where: { id: membership.teamId, creditBalanceInPaisa: { gte: cost } },
        data: { creditBalanceInPaisa: { decrement: cost } },
      })
    : await tx.user.updateMany({
        where: { id: actor.userId, creditBalanceInPaisa: { gte: cost } },
        data: { creditBalanceInPaisa: { decrement: cost } },
      })
  if (count === 0) {
    throw rejection(OverageReason.INSUFFICIENT_CREDITS, feature, actor)
  }

  const symbolSuffix = symbol ? ' ' + symbol.toUpperCase() : ''
  await tx.creditLedger.create({
    data: {
      userId: actor.userId,
      teamId: membership?.teamId,
      amountPaisa: -cost,
      type: CreditLedgerType.OVERAGE_CONSUMPTION,
      description: `Overage: ${feature}${symbolSuffix}`,
    },
  })
  await recordUsage(actor, feature, symbol, cost, tx)
  return { source: UsageSource.CREDIT, costPaisa: cost }
}
