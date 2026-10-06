import { PlanTier } from '@prisma/client'
import { ForbiddenError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import { getActiveMembership } from '../../shared/infrastructure/team-access'
import { getMyUsage, type UsageSummary } from './usage'

/**
 * Sets (or, with `null`, removes) an individual Pro user's own monthly limit on
 * credit spend. Workspace members are capped by their workspace admins instead,
 * and FREE has no credits to cap, so both are refused. Lowering the limit below
 * what has already been spent is allowed; it simply stops further spending
 * until the next cycle.
 */
export async function setSpendCap(
  userId: string,
  monthlyLimitPaisa: number | null,
): Promise<UsageSummary> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true },
  })
  if (user.plan === PlanTier.FREE) {
    throw new ForbiddenError('Spending limits are available on paid plans')
  }
  if (await getActiveMembership(userId)) {
    throw new ForbiddenError(
      'Credit limits for workspace members are set by a workspace admin',
    )
  }

  await prisma.user.update({
    where: { id: userId },
    data: { monthlyCreditLimitPaisa: monthlyLimitPaisa },
  })
  logger.info(
    `[Credits] Personal spending limit ${monthlyLimitPaisa === null ? 'removed' : 'set'} user=${userId}`,
  )

  return getMyUsage(userId)
}
