import {
  AdminAuditAction,
  CreditLedgerType,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client'
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { redactPii } from '../../shared/utils/redact'
import {
  AdminTargetType,
  logAdminAction,
  logAdminRead,
} from '../access-control'
import { replayStoredWebhook } from '../payments/public'
import { AdminCreditTarget } from './constants'
import type { AdminReadContext, AdminWriteContext } from './types'

export interface WebhookQuery {
  page: number
  limit: number
  status?: Prisma.PaymentTransactionWhereInput['status']
  trackerId?: string
  from?: Date
  to?: Date
}

/**
 * Webhook diagnostics are derived from `PaymentTransaction`: only webhooks that
 * passed X-SFPY-SIGNATURE verification are ever stored, so a stored payload
 * implies a verified signature; rejected deliveries are not persisted.
 */
export async function listWebhooks(ctx: AdminReadContext, query: WebhookQuery) {
  const where: Prisma.PaymentTransactionWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.trackerId
      ? { trackerId: { contains: query.trackerId, mode: 'insensitive' } }
      : {}),
    ...(query.from || query.to
      ? { createdAt: { gte: query.from, lte: query.to } }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.paymentTransaction.count({ where }),
    prisma.paymentTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        userId: true,
        teamId: true,
        trackerId: true,
        status: true,
        kind: true,
        planTier: true,
        amountPaisa: true,
        paymentMethod: true,
        rawWebhookPayload: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ])

  await logAdminRead(prisma, {
    adminId: ctx.adminId,
    ipAddress: ctx.ipAddress,
    targetType: AdminTargetType.PAYMENT,
    resultIds: rows.map((row) => row.id),
    filterKeys: Object.keys(query).filter(
      (key) => key !== 'page' && key !== 'limit',
    ),
  })

  const items = rows.map(({ rawWebhookPayload, ...row }) => ({
    ...row,
    webhookReceived: rawWebhookPayload !== null,
    signatureVerified: rawWebhookPayload !== null,
    payload: rawWebhookPayload,
  }))
  return { items, total, page: query.page, limit: query.limit }
}

/** Replays the stored webhook through the idempotent fulfilment handler. */
export async function retryWebhook(
  ctx: AdminWriteContext,
  transactionId: string,
) {
  const before = await prisma.paymentTransaction.findUnique({
    where: { id: transactionId },
    select: { status: true },
  })
  if (!before) throw new NotFoundError('Payment transaction not found')

  const after = await replayStoredWebhook(transactionId)

  await logAdminAction(prisma, {
    adminId: ctx.adminId,
    action: AdminAuditAction.WEBHOOK_RETRIED,
    targetType: AdminTargetType.PAYMENT,
    targetId: transactionId,
    reason: ctx.reason,
    ticketRef: ctx.ticketRef,
    ipAddress: ctx.ipAddress,
    metadata: { statusBefore: before.status, statusAfter: after.status },
  })

  return { transactionId, trackerId: after.trackerId, status: after.status }
}

interface BalanceTarget {
  field: 'userId' | 'teamId'
  update: (
    tx: Prisma.TransactionClient,
    id: string,
    amountPaisa: number,
  ) => Promise<number>
  balance: (tx: Prisma.TransactionClient, id: string) => Promise<number | null>
}

const balanceTargets: Record<AdminCreditTarget, BalanceTarget> = {
  [AdminCreditTarget.USER]: {
    field: 'userId',
    update: async (tx, id, amountPaisa) =>
      (
        await tx.user.updateMany({
          where: {
            id,
            ...(amountPaisa < 0
              ? { creditBalanceInPaisa: { gte: -amountPaisa } }
              : {}),
          },
          data: { creditBalanceInPaisa: { increment: amountPaisa } },
        })
      ).count,
    balance: async (tx, id) =>
      (
        await tx.user.findUnique({
          where: { id },
          select: { creditBalanceInPaisa: true },
        })
      )?.creditBalanceInPaisa ?? null,
  },
  [AdminCreditTarget.TEAM]: {
    field: 'teamId',
    update: async (tx, id, amountPaisa) =>
      (
        await tx.team.updateMany({
          where: {
            id,
            ...(amountPaisa < 0
              ? { creditBalanceInPaisa: { gte: -amountPaisa } }
              : {}),
          },
          data: { creditBalanceInPaisa: { increment: amountPaisa } },
        })
      ).count,
    balance: async (tx, id) =>
      (
        await tx.team.findUnique({
          where: { id },
          select: { creditBalanceInPaisa: true },
        })
      )?.creditBalanceInPaisa ?? null,
  },
}

/**
 * Atomically injects/deducts paisa on a user or team pool and appends an
 * immutable MANUAL_ADJUSTMENT ledger row. Deductions can never drive the
 * balance below zero.
 */
export async function adjustCredits(
  ctx: AdminWriteContext,
  input: { target: AdminCreditTarget; targetId: string; amountPaisa: number },
) {
  const target = balanceTargets[input.target]

  return prisma.$transaction(async (tx) => {
    const updated = await target.update(tx, input.targetId, input.amountPaisa)
    if (updated === 0) {
      const existing = await target.balance(tx, input.targetId)
      if (existing === null)
        throw new NotFoundError(`${input.target} not found`)
      throw new BadRequestError('Deduction exceeds the current credit balance')
    }

    await tx.creditLedger.create({
      data: {
        [target.field]: input.targetId,
        amountPaisa: input.amountPaisa,
        type: CreditLedgerType.MANUAL_ADJUSTMENT,
        description: redactPii(`Manual adjustment by staff: ${ctx.reason}`),
      },
    })

    await logAdminAction(tx, {
      adminId: ctx.adminId,
      action: AdminAuditAction.CREDIT_INJECTION,
      targetType:
        input.target === AdminCreditTarget.USER
          ? AdminTargetType.USER
          : AdminTargetType.TEAM,
      targetId: input.targetId,
      reason: ctx.reason,
      ticketRef: ctx.ticketRef,
      ipAddress: ctx.ipAddress,
      metadata: { amountPaisa: input.amountPaisa, target: input.target },
    })

    const balanceInPaisa = await target.balance(tx, input.targetId)
    return { ...input, balanceInPaisa }
  })
}

/** Moves a subscription's period/grace end; a GRACE row returns to ACTIVE once its period is in the future. */
export async function extendSubscription(
  ctx: AdminWriteContext,
  subscriptionId: string,
  input: { currentPeriodEnd?: Date; gracePeriodEnd?: Date },
) {
  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { id: subscriptionId },
    })
    if (!subscription) throw new NotFoundError('Subscription not found')
    if (
      subscription.status === SubscriptionStatus.CANCELLED ||
      subscription.status === SubscriptionStatus.EXPIRED
    ) {
      throw new ConflictError(
        `Cannot extend a ${subscription.status} subscription: override the plan first`,
      )
    }

    const currentPeriodEnd =
      input.currentPeriodEnd ?? subscription.currentPeriodEnd

    // A GRACE row whose period moves into the future is live again, so its
    // stale grace window is dropped unless staff supply a new one.
    const reactivate =
      subscription.status === SubscriptionStatus.GRACE &&
      currentPeriodEnd !== null &&
      currentPeriodEnd > new Date()
    const gracePeriodEnd =
      input.gracePeriodEnd ?? (reactivate ? null : subscription.gracePeriodEnd)

    if (
      currentPeriodEnd &&
      currentPeriodEnd <= subscription.currentPeriodStart
    ) {
      throw new BadRequestError(
        'currentPeriodEnd must be after the period start',
      )
    }
    if (
      currentPeriodEnd &&
      gracePeriodEnd &&
      gracePeriodEnd < currentPeriodEnd
    ) {
      throw new BadRequestError(
        'gracePeriodEnd cannot be before currentPeriodEnd',
      )
    }

    await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        currentPeriodEnd,
        gracePeriodEnd,
        ...(reactivate ? { status: SubscriptionStatus.ACTIVE } : {}),
      },
    })

    await logAdminAction(tx, {
      adminId: ctx.adminId,
      action: AdminAuditAction.SUBSCRIPTION_EXTENDED,
      targetType: AdminTargetType.SUBSCRIPTION,
      targetId: subscriptionId,
      reason: ctx.reason,
      ticketRef: ctx.ticketRef,
      ipAddress: ctx.ipAddress,
      metadata: {
        previousPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        previousGracePeriodEnd:
          subscription.gracePeriodEnd?.toISOString() ?? null,
        newPeriodEnd: currentPeriodEnd?.toISOString() ?? null,
        newGracePeriodEnd: gracePeriodEnd?.toISOString() ?? null,
        reactivated: reactivate,
      },
    })

    return {
      subscriptionId,
      currentPeriodEnd,
      gracePeriodEnd,
      status: reactivate ? SubscriptionStatus.ACTIVE : subscription.status,
    }
  })
}
