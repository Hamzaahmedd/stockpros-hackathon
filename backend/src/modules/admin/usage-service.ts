import { NotFoundError, OverageReason } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { AdminTargetType, logAdminRead } from '../access-control'
import { CreditPool, getMyUsage, type UsageSummary } from '../payments/public'
import type { AdminReadContext } from './types'

/**
 * Why the next metered AI action would be refused, or null when it would go
 * through. Mirrors the order `consumeAiSignal` enforces: the base allowance
 * first, then the spend cap, then the credit balance.
 */
export function resolveBlockedReason(
  usage: UsageSummary,
): OverageReason | null {
  const { quota, credits, spendCap } = usage
  if (!usage.metered || !quota || !credits) return null
  if (quota.remaining > 0) return null

  const cost = credits.costPerSignalPaisa
  if (spendCap && spendCap.remainingPaisa < cost) {
    return credits.pool === CreditPool.TEAM
      ? OverageReason.SPEND_LIMIT_REACHED
      : OverageReason.PERSONAL_SPEND_LIMIT_REACHED
  }
  return credits.balanceInPaisa < cost
    ? OverageReason.INSUFFICIENT_CREDITS
    : null
}

/**
 * A customer's metering position for support: allowance, spend cap, cycle
 * spend, credit balance and, if usage is currently refused, the reason. Reuses
 * the customer-facing meter so staff see exactly what enforcement sees.
 */
export async function getUserUsage(ctx: AdminReadContext, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  })
  if (!user) throw new NotFoundError('User not found')

  const usage = await getMyUsage(userId)

  await logAdminRead(prisma, {
    adminId: ctx.adminId,
    ipAddress: ctx.ipAddress,
    targetType: AdminTargetType.USER,
    resultIds: [userId],
  })

  return { userId, ...usage, blockedReason: resolveBlockedReason(usage) }
}
