import {
  AdminAuditAction,
  PlanTier,
  SubscriptionStatus,
  TeamAuditAction,
  TeamRole,
} from '@prisma/client'
import { ConflictError, NotFoundError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { getActiveMembership } from '../../shared/infrastructure/team-access'
import { recordTeamAudit } from '../../shared/infrastructure/team-audit'
import {
  AdminTargetType,
  logAdminAction,
  logAdminRead,
} from '../access-control'
import { UUID_PATTERN } from './constants'
import { maskIdentity } from './masking'
import { detachMemberTx } from './team-members'
import type { AdminReadContext, AdminWriteContext } from './types'

export async function searchUsers(
  ctx: AdminReadContext,
  query: string,
  limit: number,
) {
  const now = new Date()
  const users = await prisma.user.findMany({
    where: {
      OR: [
        ...(UUID_PATTERN.test(query) ? [{ id: query }] : []),
        { email: { contains: query, mode: 'insensitive' } },
        { displayName: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      displayName: true,
      email: true,
      status: true,
      plan: true,
      platformRole: true,
      creditBalanceInPaisa: true,
      monthlyCreditLimitPaisa: true,
      usageAlertsEnabled: true,
      deletedAt: true,
      createdAt: true,
      subscription: {
        select: {
          id: true,
          planTier: true,
          status: true,
          autoRenew: true,
          currentPeriodEnd: true,
          gracePeriodEnd: true,
        },
      },
      teamMembers: { select: { teamId: true, role: true } },
      _count: {
        select: {
          userSessions: {
            where: { isRevoked: false, expiresAt: { gt: now } },
          },
        },
      },
    },
  })

  await logAdminRead(prisma, {
    adminId: ctx.adminId,
    ipAddress: ctx.ipAddress,
    targetType: AdminTargetType.USER,
    resultIds: users.map((user) => user.id),
  })

  return users.map(({ _count, teamMembers, ...user }) => ({
    ...maskIdentity(user),
    activeSessions: _count.userSessions,
    team: teamMembers[0] ?? null,
  }))
}

/**
 * Overrides a user's plan directly (bypasses Safepay). Leaving the TEAM plan
 * detaches non-owner members from their workspace; owners must transfer
 * ownership first so the workspace is never orphaned.
 */
export async function overridePlan(
  ctx: AdminWriteContext,
  userId: string,
  plan: PlanTier,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, plan: true },
    })
    if (!user) throw new NotFoundError('User not found')

    const membership = await tx.teamMember.findUnique({ where: { userId } })
    const leavingTeamPlan =
      user.plan === PlanTier.TEAM && plan !== PlanTier.TEAM
    let detachedFromTeamId: string | null = null

    if (leavingTeamPlan && membership) {
      if (membership.role === TeamRole.OWNER) {
        throw new ConflictError(
          'User owns a workspace: transfer ownership before downgrading from TEAM',
        )
      }
      await detachMemberTx(tx, membership)
      await recordTeamAudit(tx, {
        teamId: membership.teamId,
        actorUserId: ctx.adminId,
        action: TeamAuditAction.MEMBER_REMOVED,
        targetUserId: userId,
        metadata: { role: membership.role, viaAdminPlanOverride: true },
      })
      detachedFromTeamId = membership.teamId
    }

    // Overriding away from PRO ends any live personal subscription so the
    // renewal cron cannot silently flip the user back.
    let cancelledSubscription = false
    if (plan !== PlanTier.PRO) {
      const { count } = await tx.subscription.updateMany({
        where: {
          userId,
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE] },
        },
        data: { status: SubscriptionStatus.CANCELLED, autoRenew: false },
      })
      cancelledSubscription = count > 0
    }

    await tx.user.update({ where: { id: userId }, data: { plan } })

    await logAdminAction(tx, {
      adminId: ctx.adminId,
      action: AdminAuditAction.PLAN_OVERRIDE,
      targetType: AdminTargetType.USER,
      targetId: userId,
      reason: ctx.reason,
      ticketRef: ctx.ticketRef,
      ipAddress: ctx.ipAddress,
      metadata: {
        fromPlan: user.plan,
        toPlan: plan,
        detachedFromTeamId,
        cancelledSubscription,
      },
    })

    return { userId, previousPlan: user.plan, plan, detachedFromTeamId }
  })
}

export async function invalidateSessions(
  ctx: AdminWriteContext,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!user) throw new NotFoundError('User not found')

    const { count } = await tx.userSession.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    })

    await logAdminAction(tx, {
      adminId: ctx.adminId,
      action: AdminAuditAction.USER_SESSION_INVALIDATED,
      targetType: AdminTargetType.USER,
      targetId: userId,
      reason: ctx.reason,
      ticketRef: ctx.ticketRef,
      ipAddress: ctx.ipAddress,
      metadata: { revokedSessions: count },
    })

    return { userId, revokedSessions: count }
  })
}

/** Customer fields a reveal returns, recorded on the audit row. */
const REVEALED_FIELDS = ['email', 'displayName', 'phoneNumber'] as const

/**
 * Returns a customer's real identifiers to a staff member who asked for them.
 * Revealing is audited like a write: reason, ticket and the fields shown.
 */
export async function revealUser(ctx: AdminWriteContext, userId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        phoneNumber: true,
      },
    })
    if (!user) throw new NotFoundError('User not found')

    await logAdminAction(tx, {
      adminId: ctx.adminId,
      action: AdminAuditAction.CUSTOMER_DATA_REVEALED,
      targetType: AdminTargetType.USER,
      targetId: userId,
      reason: ctx.reason,
      ticketRef: ctx.ticketRef,
      ipAddress: ctx.ipAddress,
      metadata: { fields: [...REVEALED_FIELDS] },
    })

    return user
  })
}

/**
 * Sets or clears (`null`) an individual Pro user's own monthly credit-spend
 * limit on their behalf. Refused for FREE users (nothing to cap) and workspace
 * members (their cap belongs to their workspace admins), as the customer's own
 * setting is. The limit and its audit row (previous and new value, reason,
 * ticket) commit together.
 */
export async function overrideSpendLimit(
  ctx: AdminWriteContext,
  userId: string,
  monthlyLimitPaisa: number | null,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, plan: true, monthlyCreditLimitPaisa: true },
    })
    if (!user) throw new NotFoundError('User not found')
    if (user.plan === PlanTier.FREE) {
      throw new ConflictError('Spending limits are available on paid plans')
    }
    if (await getActiveMembership(userId, tx)) {
      throw new ConflictError(
        'This user is in a workspace: their credit limit is set by a workspace admin',
      )
    }
    const previousLimitPaisa = user.monthlyCreditLimitPaisa
    if (previousLimitPaisa === monthlyLimitPaisa) {
      throw new ConflictError('The spending limit is already set to that value')
    }

    await tx.user.update({
      where: { id: userId },
      data: { monthlyCreditLimitPaisa: monthlyLimitPaisa },
    })

    await logAdminAction(tx, {
      adminId: ctx.adminId,
      action: AdminAuditAction.SPEND_LIMIT_OVERRIDDEN,
      targetType: AdminTargetType.USER,
      targetId: userId,
      reason: ctx.reason,
      ticketRef: ctx.ticketRef,
      ipAddress: ctx.ipAddress,
      metadata: { previousLimitPaisa, monthlyLimitPaisa },
    })

    return { userId, previousLimitPaisa, monthlyLimitPaisa }
  })
}
