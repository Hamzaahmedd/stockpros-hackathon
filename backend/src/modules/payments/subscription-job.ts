import config from '@/config'
import { SubscriptionPaymentMethod, TeamAuditAction } from '@prisma/client'
import { setMyPlan } from '../auth'
import {
  enqueueRenewalReminderEmail,
  type RenewalReminderVariant,
} from '../notifications/public'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import {
  effectiveSeatCapacity,
  resolveFallbackPlan,
} from '../../shared/infrastructure/team-access'
import { recordTeamAudit } from '../../shared/infrastructure/team-audit'
import {
  PLAN_PRICES_PAISA,
  SUBSCRIPTION_GRACE_PERIOD_MS,
  SUBSCRIPTION_REMINDER_WINDOW_MS,
  TEAM_EXPIRY_TX_TIMEOUT_MS,
  TEAM_SEAT_PRICE_PAISA,
} from './constants'

const formatAmount = (amountPaisa: number): string =>
  `Rs ${(amountPaisa / 100).toLocaleString('en-PK')}`

const formatDate = (date: Date): string =>
  date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

/**
 * Ends a lapsed team workspace: cancels it and sends every member back to the
 * plan they had before joining (PRO if they still hold a live personal
 * subscription, otherwise FREE). Atomic so members are never left on TEAM
 * with a cancelled workspace.
 */
const expireTeamSubscription = async (
  subscriptionId: string,
  teamId: string,
): Promise<void> => {
  await prisma.$transaction(
    async (tx) => {
      const members = await tx.teamMember.findMany({
        where: { teamId },
        select: { userId: true },
      })
      await tx.team.update({
        where: { id: teamId },
        data: { status: 'CANCELLED' },
      })
      for (const { userId } of members) {
        await tx.user.update({
          where: { id: userId },
          data: { plan: await resolveFallbackPlan(userId, tx) },
        })
      }
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'EXPIRED' },
      })
      await recordTeamAudit(tx, {
        teamId,
        action: TeamAuditAction.SUBSCRIPTION_EXPIRED,
      })
    },
    { timeout: TEAM_EXPIRY_TX_TIMEOUT_MS },
  )
}

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
    include: {
      user: { select: { email: true, displayName: true } },
      team: {
        select: {
          seatCapacity: true,
          scheduledSeatCapacity: true,
          billingEmail: true,
          owner: { select: { email: true, displayName: true } },
        },
      },
    },
  })

  const now = new Date()
  const manageUrl = `${config.server.frontendUrl}/plans`

  for (const subscription of subscriptions) {
    // Exactly one of user/team is set; team reminders go to the workspace owner.
    const owner = subscription.user ?? subscription.team?.owner
    // A workspace can name a billing contact; reminders go there instead of to the owner.
    const recipient =
      owner && subscription.team?.billingEmail
        ? { ...owner, email: subscription.team.billingEmail }
        : owner
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
            `[SubscriptionCron] subscriptionId=${subscription.id} entered grace period`,
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

        if (reminderDue && !alreadySentThisCycle && recipient) {
          await enqueueRenewalReminderEmail({
            to: recipient.email,
            subscriptionId: subscription.id,
            userName: recipient.displayName,
            amount: formatAmount(
              subscription.team
                ? effectiveSeatCapacity(subscription.team) *
                    TEAM_SEAT_PRICE_PAISA
                : PLAN_PRICES_PAISA.PRO,
            ),
            renewsOn: formatDate(subscription.currentPeriodEnd),
            manageUrl,
            // Team seats are always renewed manually, whatever the flag says.
            variant: subscription.team
              ? 'wallet'
              : resolveVariant(
                  subscription.paymentMethod,
                  subscription.autoRenew,
                ),
          })
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { reminderSentAt: now },
          })
          logger.info(
            `[SubscriptionCron] Sent renewal reminder for subscriptionId=${subscription.id}`,
          )
        }
      } else if (
        subscription.status === 'GRACE' &&
        subscription.gracePeriodEnd &&
        subscription.gracePeriodEnd <= now
      ) {
        if (subscription.teamId) {
          await expireTeamSubscription(subscription.id, subscription.teamId)
        } else if (subscription.userId) {
          await setMyPlan(subscription.userId, 'FREE')
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'EXPIRED' },
          })
        }
        logger.info(
          `[SubscriptionCron] Expired subscriptionId=${subscription.id} (grace period elapsed)`,
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
