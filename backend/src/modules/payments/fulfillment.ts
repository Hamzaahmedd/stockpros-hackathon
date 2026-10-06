import {
  CreditLedgerType,
  PaymentKind,
  PaymentStatus,
  PlanTier,
  Prisma,
  SubscriptionPaymentMethod,
  SubscriptionStatus,
  TeamAuditAction,
  TeamRole,
  type PaymentTransaction,
} from '@prisma/client'
import { BadRequestError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import { releaseLapsedMembership } from '../../shared/infrastructure/team-access'
import { recordTeamAudit } from '../../shared/infrastructure/team-audit'
import { SUBSCRIPTION_PERIOD_MS } from './constants'
import { sendTeamReceiptEmail } from './receipt-email'
import { resetLowBalanceAlert } from './usage-alerts'
import type { SafepayWebhookEvent } from './types'

/**
 * Cumulative period math: an early renewal (paid while still inside a live
 * period) adds a full cycle on top of the existing end rather than cutting off
 * remaining paid days; a first purchase or lapsed period starts from `now`.
 */
export const computeNextPeriodEnd = (
  currentPeriodEnd: Date | null | undefined,
  now: Date,
): Date => {
  const base =
    currentPeriodEnd && currentPeriodEnd > now ? currentPeriodEnd : now
  return new Date(base.getTime() + SUBSCRIPTION_PERIOD_MS)
}

/** True for transactions fulfilled by this module's transactional path (everything except a plain PRO subscription). */
export const isTeamOrCreditTransaction = (
  transaction: Pick<PaymentTransaction, 'kind' | 'planTier'>,
): boolean =>
  transaction.kind === PaymentKind.SEAT_ADDITION ||
  transaction.kind === PaymentKind.TOPUP ||
  transaction.planTier === PlanTier.TEAM

const readTeamName = (metadata: Prisma.JsonValue): string => {
  const name =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata.teamName
      : undefined
  if (typeof name !== 'string' || !name.trim()) {
    throw new BadRequestError('Team checkout is missing a team name')
  }
  return name
}

async function fulfillTeamCreation(
  tx: Prisma.TransactionClient,
  transaction: PaymentTransaction,
): Promise<void> {
  const now = new Date()
  await releaseLapsedMembership(tx, transaction.userId)
  const team = await tx.team.create({
    data: {
      name: readTeamName(transaction.metadata),
      ownerId: transaction.userId,
      seatCapacity: transaction.seatCount,
      members: {
        create: { userId: transaction.userId, role: TeamRole.OWNER },
      },
      subscription: {
        create: {
          planTier: PlanTier.TEAM,
          // Manual-renewal by design: Safepay's recurring Plan is fixed-price
          // and cannot express a per-seat amount.
          paymentMethod: SubscriptionPaymentMethod.WALLET,
          autoRenew: false,
          currentPeriodStart: now,
          currentPeriodEnd: computeNextPeriodEnd(null, now),
        },
      },
    },
    include: { subscription: { select: { id: true } } },
  })

  await tx.paymentTransaction.update({
    where: { id: transaction.id },
    data: { teamId: team.id, subscriptionId: team.subscription?.id },
  })
  await tx.user.update({
    where: { id: transaction.userId },
    data: { plan: PlanTier.TEAM },
  })
  logger.info(
    `[Payments] Created teamId=${team.id} (${transaction.seatCount} seats) for ownerId=${transaction.userId}`,
  )
}

async function fulfillTeamRenewal(
  tx: Prisma.TransactionClient,
  teamId: string,
  billedSeats: number,
): Promise<void> {
  const now = new Date()
  const subscription = await tx.subscription.findUnique({ where: { teamId } })
  if (!subscription) {
    logger.warn(
      `[Payments] Team renewal for teamId=${teamId} has no subscription`,
    )
    return
  }
  // A workspace its owner deleted stays deleted: a payment that lands late is
  // recorded but must not revive a team whose members and assets are gone.
  if (subscription.status === SubscriptionStatus.CANCELLED) {
    logger.warn(
      `[Payments] Renewal payment for deleted teamId=${teamId} needs a manual refund`,
    )
    return
  }

  await tx.subscription.update({
    where: { teamId },
    data: {
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: computeNextPeriodEnd(
        subscription.currentPeriodEnd,
        now,
      ),
      gracePeriodEnd: null,
      reminderSentAt: null,
    },
  })
  // A completed payment always wins over a lapsed workspace. The seats it was
  // billed for become the capacity, which is how a scheduled reduction lands.
  await tx.team.update({
    where: { id: teamId },
    data: {
      status: 'ACTIVE',
      seatCapacity: billedSeats,
      scheduledSeatCapacity: null,
    },
  })
  await tx.user.updateMany({
    where: { teamMembers: { some: { teamId } } },
    data: { plan: PlanTier.TEAM },
  })
}

async function fulfillSeatAddition(
  tx: Prisma.TransactionClient,
  transaction: PaymentTransaction,
): Promise<void> {
  if (!transaction.teamId) {
    throw new BadRequestError('Seat addition is missing a team')
  }
  await tx.team.update({
    where: { id: transaction.teamId },
    data: { seatCapacity: { increment: transaction.seatCount } },
  })
  await recordTeamAudit(tx, {
    teamId: transaction.teamId,
    actorUserId: transaction.userId,
    action: TeamAuditAction.SEATS_ADDED,
    metadata: { seatCount: transaction.seatCount },
  })
}

async function fulfillTopup(
  tx: Prisma.TransactionClient,
  transaction: PaymentTransaction,
): Promise<void> {
  const { teamId, userId, amountPaisa, trackerId } = transaction
  if (teamId) {
    await tx.team.update({
      where: { id: teamId },
      data: { creditBalanceInPaisa: { increment: amountPaisa } },
    })
  } else {
    await tx.user.update({
      where: { id: userId },
      data: { creditBalanceInPaisa: { increment: amountPaisa } },
    })
    await resetLowBalanceAlert(tx, userId)
  }
  await tx.creditLedger.create({
    data: {
      userId,
      teamId,
      amountPaisa,
      type: CreditLedgerType.PURCHASE,
      description: 'Credit top-up',
      trackerId,
    },
  })
}

async function applyCompletedTransaction(
  tx: Prisma.TransactionClient,
  transaction: PaymentTransaction,
): Promise<void> {
  if (transaction.kind === PaymentKind.TOPUP) {
    return fulfillTopup(tx, transaction)
  }
  if (transaction.kind === PaymentKind.SEAT_ADDITION) {
    return fulfillSeatAddition(tx, transaction)
  }
  return transaction.teamId
    ? fulfillTeamRenewal(tx, transaction.teamId, transaction.seatCount)
    : fulfillTeamCreation(tx, transaction)
}

/**
 * Applies a verified webhook to a team/seat/top-up transaction. The status
 * transition and its side effect commit atomically, so a crash can never mark
 * a payment COMPLETED without crediting it, and the conditional `updateMany`
 * (PENDING only) makes concurrent Safepay retries a no-op.
 */
export async function fulfillTeamOrCreditTransaction(
  transaction: PaymentTransaction,
  event: SafepayWebhookEvent,
  nextStatus: PaymentStatus,
  rawPayload: Prisma.InputJsonValue,
): Promise<boolean> {
  const applied = await prisma.$transaction(async (tx) => {
    const { count: affectedCount } = await tx.paymentTransaction.updateMany({
      where: { trackerId: event.trackerId, status: PaymentStatus.PENDING },
      data: {
        status: nextStatus,
        paymentMethod: event.paymentMethod,
        rawWebhookPayload: rawPayload,
      },
    })
    if (affectedCount === 0) return false

    if (nextStatus === PaymentStatus.COMPLETED) {
      await applyCompletedTransaction(tx, transaction)
    }
    return true
  })
  // After commit and best-effort: the payment stands even if the email cannot be queued.
  if (applied && nextStatus === PaymentStatus.COMPLETED) {
    await sendTeamReceiptEmail(transaction.id)
  }
  return applied
}
