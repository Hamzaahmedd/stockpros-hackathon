import config from '@/config'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import { enqueueSpendLimitChangedEmail } from '../notifications/public'
import { formatAmount } from '../payments/public'

/** What the email says when a limit is absent (removed, or never set). */
export const NO_SPEND_LIMIT_LABEL = 'No limit'

export interface SpendLimitChange {
  userId: string
  previousLimitPaisa: number | null
  monthlyLimitPaisa: number | null
  ticketRef: string
}

const describeLimit = (limitPaisa: number | null): string =>
  limitPaisa === null ? NO_SPEND_LIMIT_LABEL : formatAmount(limitPaisa)

/**
 * Tells a customer that staff changed their own spending limit, citing the
 * support ticket. Fire-and-forget by design: it runs after the change has
 * committed and must never fail or roll back the request, so every problem
 * (missing user, queue down) is logged, not thrown. Logs identifiers only.
 */
export async function notifySpendLimitChanged(
  change: SpendLimitChange,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: change.userId },
      select: { email: true, displayName: true },
    })
    if (!user) {
      logger.warn('[Admin] spend limit notice skipped: user not found', {
        userId: change.userId,
      })
      return
    }

    await enqueueSpendLimitChangedEmail({
      to: user.email,
      userId: change.userId,
      userName: user.displayName,
      previousLimit: describeLimit(change.previousLimitPaisa),
      newLimit: describeLimit(change.monthlyLimitPaisa),
      ticketRef: change.ticketRef,
      usageUrl: `${config.server.frontendUrl}/usage`,
    })
    logger.info('[Admin] spend limit change notice queued', {
      userId: change.userId,
      ticketRef: change.ticketRef,
    })
  } catch (err) {
    logger.warn(
      `[Admin] could not queue a spend limit change notice: ${String(err)}`,
    )
  }
}
