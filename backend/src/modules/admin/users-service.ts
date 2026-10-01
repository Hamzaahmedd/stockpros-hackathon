import {
  AdminAuditAction,
  PlanTier,
  SubscriptionStatus,
  TeamAuditAction,
  TeamRole,
} from '@prisma/client'
import { ConflictError, NotFoundError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { recordTeamAudit } from '../../shared/infrastructure/team-audit'
import {
  AdminTargetType,
  logAdminAction,
  logAdminRead,
} from '../access-control'
import { UUID_PATTERN } from './constants'
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
    ...user,
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
      ipAddress: ctx.ipAddress,
      metadata: { revokedSessions: count },
    })

    return { userId, revokedSessions: count }
  })
}
