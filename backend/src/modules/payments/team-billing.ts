import config from '@/config'
import {
  PaymentKind,
  PaymentStatus,
  PlanTier,
  TeamStatus,
  type Prisma,
} from '@prisma/client'
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import {
  can,
  effectiveSeatCapacity,
  findRestrictingDomain,
  getActiveMembership,
  TeamPermission,
} from '../../shared/infrastructure/team-access'
import { buildCheckoutUrl, initPaymentSession } from './client'
import {
  PAYMENT_CURRENCY,
  TEAM_MAX_SEATS,
  TEAM_SEAT_PRICE_PAISA,
  TOPUP_PACK_PRICES_PAISA,
  TopupPackId,
} from './constants'
import type { CreateCheckoutResult, SubscriptionSummary } from './types'

interface OneTimeCheckoutInput {
  userId: string
  teamId?: string
  amountPaisa: number
  seatCount?: number
  kind: PaymentKind
  planTier: PlanTier
  metadata?: Prisma.InputJsonObject
  subscriptionId?: string
}

/**
 * Safepay's tracker token only exists once /order/v1/init returns, so the
 * token — not a locally-generated id — keys the PaymentTransaction; it is also
 * the value the webhook later reports back as `data.token`.
 */
async function startOneTimeCheckout(
  input: OneTimeCheckoutInput,
): Promise<CreateCheckoutResult> {
  const { token } = await initPaymentSession(input.amountPaisa)
  const frontendUrl = config.server.frontendUrl

  const transaction = await prisma.paymentTransaction.create({
    data: {
      userId: input.userId,
      teamId: input.teamId,
      trackerId: token,
      token,
      amountPaisa: input.amountPaisa,
      seatCount: input.seatCount ?? 1,
      currency: PAYMENT_CURRENCY,
      status: PaymentStatus.PENDING,
      kind: input.kind,
      planTier: input.planTier,
      metadata: input.metadata,
      subscriptionId: input.subscriptionId,
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

/** The caller's team (any status) when they are its owner/admin — used by renewals, which must work on lapsed teams. */
async function requireTeamAdmin(userId: string) {
  const member = await prisma.teamMember.findUnique({
    where: { userId },
    include: { team: { include: { subscription: true } } },
  })
  if (!member) throw new NotFoundError('You are not part of a team workspace')
  if (!can(member.role, TeamPermission.BILLING_MANAGE)) {
    throw new ForbiddenError('Only a team owner or admin can do this')
  }
  return member.team
}

export async function assertCanCreateTeam(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  if (!user) throw new NotFoundError('User not found')

  if (await findRestrictingDomain(user.email)) {
    throw new ForbiddenError(
      "Your organization already manages a workspace. Ask your organization's admin for a seat instead of creating a new one.",
    )
  }

  const [membership, ownedTeam] = await Promise.all([
    // Only a seat in a live workspace counts; a lapsed one is released when the new team is created.
    prisma.teamMember.findFirst({
      where: { userId, team: { status: TeamStatus.ACTIVE } },
    }),
    prisma.team.findFirst({
      where: { ownerId: userId, status: TeamStatus.ACTIVE },
    }),
  ])
  if (membership || ownedTeam) {
    throw new ConflictError('You already belong to a team workspace')
  }
}

export async function createTeamCheckout(
  userId: string,
  input: { teamName: string; seatCount: number },
): Promise<CreateCheckoutResult> {
  await assertCanCreateTeam(userId)

  return startOneTimeCheckout({
    userId,
    amountPaisa: input.seatCount * TEAM_SEAT_PRICE_PAISA,
    seatCount: input.seatCount,
    kind: PaymentKind.SUBSCRIPTION,
    planTier: PlanTier.TEAM,
    metadata: { teamName: input.teamName },
  })
}

export async function createSeatAdditionCheckout(
  userId: string,
  seatCount: number,
): Promise<CreateCheckoutResult> {
  const team = await requireTeamAdmin(userId)
  if (team.status !== TeamStatus.ACTIVE) {
    throw new BadRequestError('Renew the workspace before adding seats')
  }
  if (team.seatCapacity + seatCount > TEAM_MAX_SEATS) {
    throw new BadRequestError(
      `A workspace can have at most ${TEAM_MAX_SEATS} seats`,
    )
  }

  return startOneTimeCheckout({
    userId,
    teamId: team.id,
    amountPaisa: seatCount * TEAM_SEAT_PRICE_PAISA,
    seatCount,
    kind: PaymentKind.SEAT_ADDITION,
    planTier: PlanTier.TEAM,
  })
}

export async function createTeamRenewalCheckout(
  userId: string,
): Promise<CreateCheckoutResult> {
  const team = await requireTeamAdmin(userId)

  // A scheduled reduction bills the smaller count, but never fewer seats than
  // are already in use (members plus unexpired invites).
  const [activeSeats, pendingInvites] = await Promise.all([
    prisma.teamMember.count({ where: { teamId: team.id } }),
    prisma.teamInvite.count({
      where: { teamId: team.id, expiresAt: { gt: new Date() } },
    }),
  ])
  const billedSeats = Math.max(
    effectiveSeatCapacity(team),
    activeSeats + pendingInvites,
  )

  return startOneTimeCheckout({
    userId,
    teamId: team.id,
    amountPaisa: billedSeats * TEAM_SEAT_PRICE_PAISA,
    seatCount: billedSeats,
    kind: PaymentKind.SUBSCRIPTION,
    planTier: PlanTier.TEAM,
    subscriptionId: team.subscription?.id,
  })
}

/**
 * Credits go to the team pool when the buyer is a team owner/admin, to the
 * buyer's own pool when they are a PRO user, and are refused otherwise.
 */
export async function createTopupCheckout(
  userId: string,
  packId: TopupPackId,
): Promise<CreateCheckoutResult> {
  const amountPaisa = TOPUP_PACK_PRICES_PAISA[packId]
  const membership = await getActiveMembership(userId)

  if (membership) {
    if (!can(membership.role, TeamPermission.BILLING_MANAGE)) {
      throw new ForbiddenError(
        'Only a team owner or admin can top up the shared credit pool',
      )
    }
    return startOneTimeCheckout({
      userId,
      teamId: membership.teamId,
      amountPaisa,
      kind: PaymentKind.TOPUP,
      planTier: PlanTier.TEAM,
      metadata: { packId },
    })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  })
  if (user?.plan !== PlanTier.PRO) {
    throw new ForbiddenError('Credit top-ups require a Pro or Team plan')
  }
  return startOneTimeCheckout({
    userId,
    amountPaisa,
    kind: PaymentKind.TOPUP,
    planTier: PlanTier.PRO,
    metadata: { packId },
  })
}

const toSummary = (subscription: {
  paymentMethod: SubscriptionSummary['paymentMethod']
  autoRenew: boolean
  status: SubscriptionSummary['status']
  currentPeriodEnd: Date | null
  gracePeriodEnd: Date | null
}): SubscriptionSummary => ({
  paymentMethod: subscription.paymentMethod,
  autoRenew: subscription.autoRenew,
  status: subscription.status,
  currentPeriodEnd: subscription.currentPeriodEnd,
  gracePeriodEnd: subscription.gracePeriodEnd,
})

export async function getTeamSubscriptionSummary(
  userId: string,
): Promise<SubscriptionSummary> {
  const team = await requireTeamAdmin(userId)
  if (!team.subscription) throw new NotFoundError('No subscription found')
  return toSummary(team.subscription)
}

/**
 * Flag-only by design: team seats are renewed manually (no per-seat recurring
 * charge exists), so this records intent for reminders/UX but never moves money.
 */
export async function toggleTeamAutoRenew(
  userId: string,
  enabled: boolean,
): Promise<SubscriptionSummary> {
  const team = await requireTeamAdmin(userId)
  if (!team.subscription) throw new NotFoundError('No subscription found')

  const updated = await prisma.subscription.update({
    where: { teamId: team.id },
    data: { autoRenew: enabled },
  })
  return toSummary(updated)
}
