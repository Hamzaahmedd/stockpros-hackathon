import config from '@/config'
import {
  PaymentKind,
  PaymentStatus,
  Prisma,
  Subscription,
  SubscriptionPaymentMethod,
} from '@prisma/client'
import { setMyPlan } from '../auth'
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import {
  buildCheckoutUrl,
  createSubscriptionCheckout,
  initPaymentSession,
  pauseSafepaySubscription,
  resumeSafepaySubscription,
} from './client'
import {
  PLAN_PRICES_PAISA,
  PAYMENT_CURRENCY,
  SUBSCRIPTION_GRACE_PERIOD_MS,
} from './constants'
import {
  computeNextPeriodEnd,
  fulfillTeamOrCreditTransaction,
  isTeamOrCreditTransaction,
} from './fulfillment'
import type {
  CreateCheckoutResult,
  SafepaySubscriptionWebhookEvent,
  SafepayWebhookEvent,
  SubscriptionSummary,
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
  paymentMethod: SubscriptionPaymentMethod,
): Promise<CreateCheckoutResult> {
  const amountPaisa = PLAN_PRICES_PAISA.PRO
  const frontendUrl = config.server.frontendUrl

  // Upsert the Subscription row first so both branches below can link to it.
  // `currentPeriodEnd` is deliberately left untouched here (null on first
  // create) — it's only ever set once Safepay actually confirms a payment
  // (handleWebhookEvent for WALLET, handleSubscriptionRenewalWebhookEvent for
  // CARD), matching the existing "only a confirmed payment grants access"
  // invariant. CARD defaults to auto-renew on; WALLET has no recurring
  // capability, so it's never toggleable.
  const subscription = await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      planTier: 'PRO',
      paymentMethod,
      autoRenew: paymentMethod === SubscriptionPaymentMethod.CARD,
    },
    update: {
      paymentMethod,
      autoRenew: paymentMethod === SubscriptionPaymentMethod.CARD,
    },
  })

  if (paymentMethod === SubscriptionPaymentMethod.CARD) {
    // Plan-based recurring flow (see client.ts) — the customer authorizes
    // once and Safepay bills the card each cycle on its own, notifying us
    // via payment.succeeded/payment.failed webhooks rather than the one-time
    // checkout webhook below.
    const { safepaySubscriptionId, subscriptionCheckoutUrl } =
      await createSubscriptionCheckout({
        reference: subscription.id,
        redirectUrl: `${frontendUrl}/plans/result?tracker_id=${subscription.id}&status=success`,
        cancelUrl: `${frontendUrl}/plans/result?tracker_id=${subscription.id}&status=cancelled`,
      })

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { safepaySubscriptionId },
    })

    return {
      checkoutUrl: subscriptionCheckoutUrl,
      trackerId: safepaySubscriptionId,
    }
  }

  // WALLET — unchanged one-time checkout flow (no recurring capability).
  // Safepay's tracker token only exists once /order/v1/init returns, so the
  // token — not a locally-generated id — is what we key PaymentTransaction
  // on; it's also the same value the webhook later reports back as
  // `data.token`, which is what makes the two correlate.
  const { token } = await initPaymentSession(amountPaisa)

  const transaction = await prisma.paymentTransaction.create({
    data: {
      userId,
      trackerId: token,
      amountPaisa,
      kind: PaymentKind.SUBSCRIPTION,
      currency: PAYMENT_CURRENCY,
      status: PaymentStatus.PENDING,
      planTier: 'PRO',
      subscriptionId: subscription.id,
    },
  })

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
 * any non-2xx/timeout response, and can deliver those retries concurrently,
 * so the PENDING -> terminal transition is done as a single conditional
 * `updateMany` (translates to one atomic `UPDATE ... WHERE status = PENDING`
 * in Postgres) rather than a read-then-write check — otherwise two
 * concurrent deliveries could both observe PENDING and both grant a plan
 * upgrade.
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

  const nextStatus = EVENT_STATUS_MAP[event.status]

  // Team creation/renewal, seat additions and credit top-ups commit their
  // status change and side effect atomically (see fulfillment.ts).
  if (isTeamOrCreditTransaction(transaction)) {
    const applied = await fulfillTeamOrCreditTransaction(
      transaction,
      event,
      nextStatus,
      rawPayload,
    )
    logger.info(
      applied
        ? `[Payments] Applied ${transaction.kind} trackerId=${event.trackerId} status=${nextStatus}`
        : `[Payments] Ignoring webhook for trackerId=${event.trackerId}, already ${transaction.status}`,
    )
    return
  }

  const { count } = await prisma.paymentTransaction.updateMany({
    where: { trackerId: event.trackerId, status: PaymentStatus.PENDING },
    data: {
      status: nextStatus,
      paymentMethod: event.paymentMethod,
      rawWebhookPayload: rawPayload,
    },
  })

  if (count === 0) {
    logger.info(
      `[Payments] Ignoring webhook for trackerId=${event.trackerId}, already ${transaction.status}`,
    )
    return
  }

  if (nextStatus === PaymentStatus.COMPLETED) {
    await setMyPlan(transaction.userId, transaction.planTier)
    await extendSubscriptionPeriod(transaction.userId)
    logger.info(
      `[Payments] Upgraded userId=${transaction.userId} to ${transaction.planTier} via trackerId=${event.trackerId}`,
    )
  }
}

/**
 * Applies a verified Safepay `payment.succeeded`/`payment.failed` webhook
 * for the Plan-based recurring-card flow — distinct from `handleWebhookEvent`
 * above, which only handles the one-time checkout webhook shape. Looks the
 * subscription up by either our own `reference` (its `id`, the value we
 * originally sent Safepay) or a Safepay-assigned `safepaySubscriptionId`,
 * whichever the webhook actually echoes back — see types.ts's doc comment on
 * `SafepaySubscriptionWebhookEvent` for why both are checked.
 */
export async function handleSubscriptionRenewalWebhookEvent(
  event: SafepaySubscriptionWebhookEvent,
): Promise<void> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      OR: [{ id: event.reference }, { safepaySubscriptionId: event.reference }],
    },
  })

  // Team subscriptions (no userId) are never billed by Safepay's recurring
  // Plan, so a webhook resolving to one is unexpected and ignored.
  if (!subscription?.userId) {
    logger.warn(
      `[Payments] Subscription webhook received for unknown reference=${event.reference}`,
    )
    return
  }

  if (event.type === 'payment.succeeded') {
    await setMyPlan(subscription.userId, subscription.planTier)
    await extendSubscriptionPeriod(subscription.userId)
    logger.info(
      `[Payments] Subscription renewal succeeded userId=${subscription.userId}`,
    )
    return
  }

  // payment.failed — mirrors the day-30 cron transition (see
  // subscription-job.ts) but reacts immediately instead of waiting for the
  // next scheduled run, since Safepay already told us the auto-charge failed.
  if (subscription.status === 'ACTIVE') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'GRACE',
        gracePeriodEnd: new Date(Date.now() + SUBSCRIPTION_GRACE_PERIOD_MS),
      },
    })
    logger.warn(
      `[Payments] Subscription renewal failed, entering grace userId=${subscription.userId}`,
    )
  }
}

/**
 * Extends the user's subscription period cumulatively: an early renewal
 * (paid again while still inside a live period) adds 30 days on top of the
 * existing `currentPeriodEnd` rather than cutting off remaining paid days.
 * A first purchase, or a renewal after the period already lapsed, simply
 * starts a fresh 30-day period from now. Also clears any grace/reminder
 * state and reactivates the subscription — a completed payment always wins
 * over GRACE/EXPIRED.
 */
async function extendSubscriptionPeriod(userId: string): Promise<void> {
  const existing = await prisma.subscription.findUnique({ where: { userId } })
  const now = new Date()

  const newPeriodEnd = computeNextPeriodEnd(existing?.currentPeriodEnd, now)

  await prisma.subscription.update({
    where: { userId },
    data: {
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: newPeriodEnd,
      gracePeriodEnd: null,
      reminderSentAt: null,
    },
  })
}

/** WALLET-only manual renewal — the "Pay & Extend for 30 Days" CTA. */
export async function renewSubscription(
  userId: string,
): Promise<CreateCheckoutResult> {
  return createCheckoutSession(userId, SubscriptionPaymentMethod.WALLET)
}

export async function toggleAutoRenew(
  userId: string,
  enabled: boolean,
): Promise<SubscriptionSummary> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  })

  if (!subscription) {
    throw new NotFoundError('No subscription found')
  }
  if (subscription.paymentMethod !== SubscriptionPaymentMethod.CARD) {
    throw new BadRequestError(
      'Auto-renew can only be toggled for card subscriptions',
    )
  }

  // Only wired up once a subscription checkout has actually been authorized
  // (safepaySubscriptionId set) — a CARD subscription created but not yet
  // confirmed has nothing on Safepay's side to pause/resume yet.
  if (subscription.safepaySubscriptionId) {
    if (enabled) {
      await resumeSafepaySubscription(subscription.safepaySubscriptionId)
    } else {
      await pauseSafepaySubscription(subscription.safepaySubscriptionId)
    }
  }

  const updated = await prisma.subscription.update({
    where: { userId },
    data: { autoRenew: enabled },
  })

  return toSubscriptionSummary(updated)
}

export async function getSubscriptionSummary(
  userId: string,
): Promise<SubscriptionSummary> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  })

  if (!subscription) {
    throw new NotFoundError('No subscription found')
  }

  return toSubscriptionSummary(subscription)
}

function toSubscriptionSummary(
  subscription: Subscription,
): SubscriptionSummary {
  return {
    paymentMethod: subscription.paymentMethod,
    autoRenew: subscription.autoRenew,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    gracePeriodEnd: subscription.gracePeriodEnd,
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
