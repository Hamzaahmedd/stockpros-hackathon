import config from '@/config'
import { SubscriptionPaymentMethod } from '@prisma/client'
import { setMyPlan } from '../auth'
import {
  enqueueRenewalReminderEmail,
  type RenewalReminderVariant,
} from '../notifications/public'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import {
  PLAN_PRICES_PAISA,
  SUBSCRIPTION_GRACE_PERIOD_MS,
  SUBSCRIPTION_REMINDER_WINDOW_MS,
} from './constants'

const formatAmount = (amountPaisa: number): string =>
  `Rs ${(amountPaisa / 100).toLocaleString('en-PK')}`

const formatDate = (date: Date): string =>
  date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

const resolveVariant = (
  paymentMethod: SubscriptionPaymentMethod,
  autoRenew: boolean,
): RenewalReminderVariant => {
  if (paymentMethod === SubscriptionPaymentMethod.WALLET) return 'wallet'
  return autoRenew ? 'card-on' : 'card-off'
}

/**
 * Daily job covering the full lifecycle a subscription passes through once
 * it's past first purchase:
 *   - day 27 (3 days before currentPeriodEnd): reminder email, deduped per
 *     billing cycle via reminderSentAt vs. currentPeriodStart.
 *   - day 30 (currentPeriodEnd elapsed): move ACTIVE -> GRACE.
 *   - grace elapsed (gracePeriodEnd elapsed): downgrade to FREE, GRACE -> EXPIRED.
 *
 * Phase 2's card auto-charge job is expected to run before this one in the
 * daily sequence — a successful recurring charge extends currentPeriodEnd,
 * so those rows never reach the day-30 branch here.
 */
export const runSubscriptionExpiryJob = async (): Promise<void> => {
  const subscriptions = await prisma.subscription.findMany({
    where: { status: { in: ['ACTIVE', 'GRACE'] } },
    include: { user: { select: { email: true, displayName: true } } },
  })

  const now = new Date()
  const manageUrl = `${config.server.frontendUrl}/plans`

  for (const subscription of subscriptions) {
    try {
      if (subscription.status === 'ACTIVE' && subscription.currentPeriodEnd) {
        if (subscription.currentPeriodEnd <= now) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              status: 'GRACE',
              gracePeriodEnd: new Date(
                now.getTime() + SUBSCRIPTION_GRACE_PERIOD_MS,
              ),
            },
          })
          logger.info(
            `[SubscriptionCron] userId=${subscription.userId} entered grace period`,
          )
          continue
        }

        const reminderDue =
          subscription.currentPeriodEnd.getTime() -
            SUBSCRIPTION_REMINDER_WINDOW_MS <=
          now.getTime()
        const alreadySentThisCycle =
          subscription.reminderSentAt !== null &&
          subscription.reminderSentAt >= subscription.currentPeriodStart

        if (reminderDue && !alreadySentThisCycle) {
          await enqueueRenewalReminderEmail({
            to: subscription.user.email,
            userName: subscription.user.displayName,
            amount: formatAmount(PLAN_PRICES_PAISA.PRO),
            renewsOn: formatDate(subscription.currentPeriodEnd),
            manageUrl,
            variant: resolveVariant(
              subscription.paymentMethod,
              subscription.autoRenew,
            ),
          })
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { reminderSentAt: now },
          })
          logger.info(
            `[SubscriptionCron] Sent renewal reminder to userId=${subscription.userId}`,
          )
        }
      } else if (
        subscription.status === 'GRACE' &&
        subscription.gracePeriodEnd &&
        subscription.gracePeriodEnd <= now
      ) {
        await setMyPlan(subscription.userId, 'FREE')
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'EXPIRED' },
        })
        logger.info(
          `[SubscriptionCron] Downgraded userId=${subscription.userId} to FREE (grace period elapsed)`,
        )
      }
    } catch (err) {
      logger.error(
        `[SubscriptionCron] Failed processing subscription id=${subscription.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }
}
