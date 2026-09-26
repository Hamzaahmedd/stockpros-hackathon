import config from '@/config'
import { PaymentStatus, Prisma } from '@prisma/client'
import { setMyPlan } from '../auth'
import { ForbiddenError, NotFoundError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import { buildCheckoutUrl, initPaymentSession } from './client'
import { PLAN_PRICES_PAISA, PAYMENT_CURRENCY } from './constants'
import type {
  CreateCheckoutResult,
  SafepayWebhookEvent,
  VerifyTrackerResult,
} from './types'

const EVENT_STATUS_MAP: Record<SafepayWebhookEvent['status'], PaymentStatus> = {
  COMPLETED: PaymentStatus.COMPLETED,
  CANCELLED: PaymentStatus.CANCELLED,
  FAILED: PaymentStatus.FAILED,
  PENDING: PaymentStatus.PENDING,
}

export async function createCheckoutSession(
  userId: string,
): Promise<CreateCheckoutResult> {
  const amountPaisa = PLAN_PRICES_PAISA.PRO

  // Safepay's tracker token only exists once /order/v1/init returns, so the
  // token — not a locally-generated id — is what we key PaymentTransaction
  // on; it's also the same value the webhook later reports back as
  // `data.token`, which is what makes the two correlate.
  const { token } = await initPaymentSession(amountPaisa)

  const transaction = await prisma.paymentTransaction.create({
    data: {
      userId,
      trackerId: token,
      amount: amountPaisa,
      currency: PAYMENT_CURRENCY,
      status: PaymentStatus.PENDING,
      planTier: 'PRO',
    },
  })

  const frontendUrl = config.server.frontendUrl
  const checkoutUrl = buildCheckoutUrl({
    token,
    orderId: transaction.id,
    redirectUrl: `${frontendUrl}/plans/result?tracker_id=${token}&status=success`,
    cancelUrl: `${frontendUrl}/plans/result?tracker_id=${token}&status=cancelled`,
  })

  return { checkoutUrl, trackerId: token }
}

/**
 * Applies a verified Safepay webhook event to the matching
 * `PaymentTransaction`, idempotently. Safepay retries webhook delivery on
 * any non-2xx/timeout response, so a transaction already in a terminal state
 * (`COMPLETED`, `FAILED`, `CANCELLED`) short-circuits without reprocessing —
 * in particular, without granting a second plan upgrade.
 */
export async function handleWebhookEvent(
  event: SafepayWebhookEvent,
  rawPayload: Prisma.InputJsonValue,
): Promise<void> {
  const transaction = await prisma.paymentTransaction.findUnique({
    where: { trackerId: event.trackerId },
  })

  if (!transaction) {
    logger.warn(
      `[Payments] Webhook received for unknown trackerId=${event.trackerId}`,
    )
    return
  }

  if (transaction.status !== PaymentStatus.PENDING) {
    logger.info(
      `[Payments] Ignoring webhook for trackerId=${event.trackerId}, already ${transaction.status}`,
    )
    return
  }

  const nextStatus = EVENT_STATUS_MAP[event.status]

  await prisma.paymentTransaction.update({
    where: { trackerId: event.trackerId },
    data: {
      status: nextStatus,
      paymentMethod: event.paymentMethod,
      rawWebhookPayload: rawPayload,
    },
  })

  if (nextStatus === PaymentStatus.COMPLETED) {
    await setMyPlan(transaction.userId, transaction.planTier)
    logger.info(
      `[Payments] Upgraded userId=${transaction.userId} to ${transaction.planTier} via trackerId=${event.trackerId}`,
    )
  }
}

export async function verifyTracker(
  userId: string,
  trackerId: string,
): Promise<VerifyTrackerResult> {
  const transaction = await prisma.paymentTransaction.findUnique({
    where: { trackerId },
  })

  if (!transaction) {
    throw new NotFoundError('Payment transaction not found')
  }

  if (transaction.userId !== userId) {
    throw new ForbiddenError('This payment transaction does not belong to you')
  }

  return {
    trackerId: transaction.trackerId,
    status: transaction.status,
    plan: transaction.planTier,
  }
}
