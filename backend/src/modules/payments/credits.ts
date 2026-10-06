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

/** Where the user stands in the billing cycle once this signal has been counted. */
export interface MeterQuota {
  used: number
  limit: number
  windowStart: Date
  windowEnd: Date | null
}

export interface MeterResult {
  source: UsageSource
  costPaisa: number
  quota: MeterQuota
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

type DbClient = Prisma.TransactionClient | typeof prisma

export interface SpendCap {
  limitPaisa: number
  /** What the caller is told when it is hit, so the UI can point at who can change it. */
  reason: OverageReason
}

/**
 * The credit-spend cap that applies to this actor: the workspace admin's limit
 * for a member, otherwise the user's own (individual Pro). Null = uncapped.
 */
export async function resolveSpendCap(
  client: DbClient,
  actor: MeterActor,
): Promise<SpendCap | null> {
  if (actor.membership) {
    const limit = actor.membership.monthlyCreditLimitPaisa
    return limit == null
      ? null
      : { limitPaisa: limit, reason: OverageReason.SPEND_LIMIT_REACHED }
  }
  const user = await client.user.findUnique({
    where: { id: actor.userId },
    select: { monthlyCreditLimitPaisa: true },
  })
  const limit = user?.monthlyCreditLimitPaisa
  return limit == null
    ? null
    : {
        limitPaisa: limit,
        reason: OverageReason.PERSONAL_SPEND_LIMIT_REACHED,
      }
}

/**
 * Credit the actor has drawn since `windowStart`: their own draws inside the
 * workspace for a member, or their personal-balance draws otherwise.
 */
export async function sumCreditSpend(
  client: DbClient,
  actor: MeterActor,
  windowStart: Date,
): Promise<number> {
  const spent = await client.creditLedger.aggregate({
    _sum: { amountPaisa: true },
    where: {
      userId: actor.userId,
      teamId: actor.membership?.teamId ?? null,
      type: CreditLedgerType.OVERAGE_CONSUMPTION,
      createdAt: { gte: windowStart },
    },
  })
  // Consumption rows are stored negative.
  return Math.abs(spent._sum.amountPaisa ?? 0)
}

/**
 * Credit each workspace member has drawn this cycle, for a page of workspaces
 * in two queries (no per-member lookups). Each team uses its own billing
 * window, as {@link resolveUsageWindow} does for enforcement. Keyed by
 * `${teamId}:${userId}`; members who spent nothing are absent.
 */
export async function sumTeamMemberSpend(
  teamIds: string[],
  now: Date = new Date(),
): Promise<Map<string, number>> {
  const spend = new Map<string, number>()
  if (teamIds.length === 0) return spend

  const subscriptions = await prisma.subscription.findMany({
    where: { teamId: { in: teamIds } },
    select: { teamId: true, currentPeriodStart: true, currentPeriodEnd: true },
  })
  const periodStart = new Map(
    subscriptions.flatMap((subscription) =>
      subscription.teamId && subscription.currentPeriodEnd
        ? [[subscription.teamId, subscription.currentPeriodStart] as const]
        : [],
    ),
  )

  const rows = await prisma.creditLedger.groupBy({
    by: ['teamId', 'userId'],
    _sum: { amountPaisa: true },
    where: {
      type: CreditLedgerType.OVERAGE_CONSUMPTION,
      OR: teamIds.map((teamId) => ({
        teamId,
        createdAt: { gte: periodStart.get(teamId) ?? startOfUtcMonth(now) },
      })),
    },
  })
  for (const row of rows) {
    if (row.teamId && row.userId) {
      // Consumption rows are stored negative.
      spend.set(
        `${row.teamId}:${row.userId}`,
        Math.abs(row._sum.amountPaisa ?? 0),
      )
    }
  }
  return spend
}

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
  const window = await resolveUsageWindow(actor)
  const windowStart = window.start
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
    const quota: MeterQuota = {
      used: used + 1,
      limit: baseLimit,
      windowStart,
      windowEnd: window.end,
    }
    if (used < baseLimit) {
      await recordUsage(actor, feature, symbol, 0, tx)
      return { source: UsageSource.BASE, costPaisa: 0, quota }
    }

    return consumeCredit(tx, actor, feature, symbol, quota)
  })
}

/** Steps 2–5 of the sequence, inside the caller's transaction and lock. */
async function consumeCredit(
  tx: Prisma.TransactionClient,
  actor: MeterActor,
  feature: MeteredFeature,
  symbol: string | undefined,
  quota: MeterQuota,
): Promise<MeterResult> {
  const cost = OVERAGE_COST_PAISA_PER_SIGNAL
  const { membership } = actor

  const cap = await resolveSpendCap(tx, actor)
  if (cap) {
    const spentPaisa = await sumCreditSpend(tx, actor, quota.windowStart)
    if (spentPaisa + cost > cap.limitPaisa) {
      throw rejection(cap.reason, feature, actor)
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
  return { source: UsageSource.CREDIT, costPaisa: cost, quota }
}
