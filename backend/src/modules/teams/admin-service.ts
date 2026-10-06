import {
  PaymentStatus,
  SubscriptionStatus,
  TeamAuditAction,
  TeamRole,
  TeamStatus,
  UserStatus,
} from '@prisma/client'
import crypto from 'node:crypto'
import config from '@/config'
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import {
  can,
  resolveFallbackPlan,
  TeamPermission,
} from '../../shared/infrastructure/team-access'
import { recordTeamAudit } from '../../shared/infrastructure/team-audit'
import { hashToken } from '../../shared/utils'
import { INVITE_TTL_MS, TEAM_DELETE_TX_TIMEOUT_MS } from './constants'
import {
  detachMember,
  dispatchInviteEmail,
  lockTeamRow,
  requireMembership,
} from './service'
import type { AuditLogQuery } from './validation'

// ─── Roles & ownership ───────────────────────────────────────────────────────

export async function changeMemberRole(
  actorId: string,
  targetUserId: string,
  role: 'ADMIN' | 'MEMBER',
) {
  const actor = await requireMembership(actorId, {
    permission: TeamPermission.MEMBERS_CHANGE_ROLE,
  })
  if (targetUserId === actorId) {
    throw new ForbiddenError('You cannot change your own role')
  }

  return prisma.$transaction(async (tx) => {
    await lockTeamRow(tx, actor.teamId)
    const target = await tx.teamMember.findUnique({
      where: { userId: targetUserId },
    })
    if (target?.teamId !== actor.teamId) {
      throw new NotFoundError('Member not found in your workspace')
    }
    if (target.role === TeamRole.OWNER) {
      throw new ForbiddenError(
        'The owner role can only be handed over by transferring ownership',
      )
    }
    if (target.role === role) return { userId: targetUserId, role }

    await tx.teamMember.update({ where: { id: target.id }, data: { role } })
    await recordTeamAudit(tx, {
      teamId: actor.teamId,
      actorUserId: actorId,
      action: TeamAuditAction.ROLE_CHANGED,
      targetUserId,
      metadata: { from: target.role, to: role },
    })
    return { userId: targetUserId, role }
  })
}

/**
 * Hands the workspace to another member; the previous owner stays on as an
 * admin. The target must already be a seated, active member — a pending
 * invite has no membership yet and is refused.
 */
export async function transferOwnership(actorId: string, targetUserId: string) {
  const actor = await requireMembership(actorId, {
    permission: TeamPermission.OWNERSHIP_TRANSFER,
  })
  if (targetUserId === actorId) {
    throw new BadRequestError('You already own this workspace')
  }

  await prisma.$transaction(async (tx) => {
    await lockTeamRow(tx, actor.teamId)
    const target = await tx.teamMember.findUnique({
      where: { userId: targetUserId },
      include: { user: { select: { status: true } } },
    })
    if (target?.teamId !== actor.teamId) {
      throw new NotFoundError('Member not found in your workspace')
    }
    if (target.user.status !== UserStatus.ACTIVE) {
      throw new BadRequestError('Ownership can only go to an active member')
    }

    await tx.team.update({
      where: { id: actor.teamId },
      data: { ownerId: targetUserId },
    })
    await tx.teamMember.update({
      where: { id: target.id },
      data: { role: TeamRole.OWNER, monthlyCreditLimitPaisa: null },
    })
    await tx.teamMember.update({
      where: { userId: actorId },
      data: { role: TeamRole.ADMIN },
    })
    await recordTeamAudit(tx, {
      teamId: actor.teamId,
      actorUserId: actorId,
      action: TeamAuditAction.OWNERSHIP_TRANSFERRED,
      targetUserId,
    })
  })
}

export async function leaveTeam(userId: string) {
  const membership = await requireMembership(userId)
  if (membership.role === TeamRole.OWNER) {
    throw new ForbiddenError(
      'Transfer ownership to another member before leaving the workspace',
    )
  }

  await prisma.$transaction(async (tx) => {
    const member = await tx.teamMember.findUniqueOrThrow({ where: { userId } })
    await detachMember(tx, member.id, userId)
    await recordTeamAudit(tx, {
      teamId: membership.teamId,
      actorUserId: userId,
      action: TeamAuditAction.MEMBER_LEFT,
      metadata: { role: membership.role },
    })
  })
}

// ─── Pending invites ─────────────────────────────────────────────────────────

export async function listInvites(actorId: string) {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.MEMBERS_INVITE,
  })
  return prisma.teamInvite.findMany({
    where: { teamId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
    },
  })
}

async function findManageableInvite(actorId: string, inviteId: string) {
  const actor = await requireMembership(actorId, {
    permission: TeamPermission.MEMBERS_INVITE,
  })
  const invite = await prisma.teamInvite.findFirst({
    where: { id: inviteId, teamId: actor.teamId },
  })
  if (!invite) throw new NotFoundError('Invite not found in your workspace')
  if (
    invite.role === TeamRole.ADMIN &&
    !can(actor.role, TeamPermission.ADMINS_MANAGE)
  ) {
    throw new ForbiddenError('Only the owner can manage an admin invite')
  }
  return { actor, invite }
}

export async function revokeInvite(actorId: string, inviteId: string) {
  const { actor, invite } = await findManageableInvite(actorId, inviteId)
  await prisma.$transaction(async (tx) => {
    await tx.teamInvite.delete({ where: { id: invite.id } })
    await recordTeamAudit(tx, {
      teamId: actor.teamId,
      actorUserId: actorId,
      action: TeamAuditAction.INVITE_REVOKED,
      metadata: { inviteId: invite.id, role: invite.role },
    })
  })
}

/** Issues a fresh link and expiry for the same invite (the old link stops working). */
export async function resendInvite(actorId: string, inviteId: string) {
  const { actor, invite } = await findManageableInvite(actorId, inviteId)
  const rawToken = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.teamInvite.update({
      where: { id: invite.id },
      data: { token: hashToken(rawToken), expiresAt },
    })
    await recordTeamAudit(tx, {
      teamId: actor.teamId,
      actorUserId: actorId,
      action: TeamAuditAction.INVITE_RESENT,
      metadata: { inviteId: invite.id },
    })
    return next
  })

  const inviteLink = `${config.server.frontendUrl}/teams/invite?token=${rawToken}`
  const emailQueued = await dispatchInviteEmail(actorId, updated, inviteLink)
  return {
    invite: {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      expiresAt: updated.expiresAt,
    },
    inviteLink,
    emailQueued,
  }
}

// ─── Workspace lifecycle ─────────────────────────────────────────────────────

export async function renameTeam(actorId: string, name: string) {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.SETTINGS_MANAGE,
  })
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.update({
      where: { id: teamId },
      data: { name },
      select: { id: true, name: true },
    })
    await recordTeamAudit(tx, {
      teamId,
      actorUserId: actorId,
      action: TeamAuditAction.TEAM_RENAMED,
    })
    return team
  })
}

/**
 * Ends the workspace at the owner's request. Shared assets, invites and
 * domains are purged and every member is released (their seat row is deleted
 * so they can join another workspace) back to their personal plan. Payment
 * history, the credit ledger and the audit trail are kept — they hold no
 * personal data.
 */
export async function deleteTeam(actorId: string, confirmName: string) {
  const actor = await requireMembership(actorId, {
    permission: TeamPermission.TEAM_DELETE,
  })
  const team = await prisma.team.findUniqueOrThrow({
    where: { id: actor.teamId },
    select: { name: true },
  })
  if (confirmName !== team.name) {
    throw new BadRequestError('Type the workspace name exactly to confirm')
  }

  await prisma.$transaction(
    async (tx) => {
      await lockTeamRow(tx, actor.teamId)
      const members = await tx.teamMember.findMany({
        where: { teamId: actor.teamId },
        select: { userId: true, role: true },
      })

      await tx.team.update({
        where: { id: actor.teamId },
        data: {
          status: TeamStatus.CANCELLED,
          billingEmail: null,
          scheduledSeatCapacity: null,
          orgInstructions: null,
        },
      })
      await tx.subscription.updateMany({
        where: { teamId: actor.teamId },
        data: { autoRenew: false, status: SubscriptionStatus.CANCELLED },
      })
      await Promise.all([
        tx.sharedWatchlist.deleteMany({ where: { teamId: actor.teamId } }),
        tx.sharedScreener.deleteMany({ where: { teamId: actor.teamId } }),
        tx.sharedResearchNote.deleteMany({ where: { teamId: actor.teamId } }),
        tx.teamInvite.deleteMany({ where: { teamId: actor.teamId } }),
        tx.teamJoinRequest.deleteMany({ where: { teamId: actor.teamId } }),
        tx.teamDomain.deleteMany({ where: { teamId: actor.teamId } }),
        tx.teamMember.deleteMany({ where: { teamId: actor.teamId } }),
      ])

      for (const member of members) {
        await tx.user.update({
          where: { id: member.userId },
          data: { plan: await resolveFallbackPlan(member.userId, tx) },
        })
        await recordTeamAudit(tx, {
          teamId: actor.teamId,
          actorUserId: actorId,
          action: TeamAuditAction.MEMBER_REMOVED,
          targetUserId: member.userId,
          metadata: { role: member.role, reason: 'TEAM_DELETED' },
        })
      }
      await recordTeamAudit(tx, {
        teamId: actor.teamId,
        actorUserId: actorId,
        action: TeamAuditAction.TEAM_DELETED,
      })
    },
    { timeout: TEAM_DELETE_TX_TIMEOUT_MS },
  )
}

// ─── Billing contact & seat reduction ────────────────────────────────────────

export async function updateBillingContact(
  actorId: string,
  billingEmail: string | null,
) {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.BILLING_MANAGE,
  })
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.update({
      where: { id: teamId },
      data: { billingEmail },
      select: { billingEmail: true },
    })
    await recordTeamAudit(tx, {
      teamId,
      actorUserId: actorId,
      action: TeamAuditAction.BILLING_CONTACT_UPDATED,
      metadata: { cleared: billingEmail === null },
    })
    return team
  })
}

/**
 * Schedules a smaller seat count for the next renewal. Nothing is refunded
 * mid-term; invites are limited to the smaller count straight away so the
 * plan cannot be outgrown before it takes effect.
 */
export async function scheduleSeatReduction(
  actorId: string,
  seatCount: number,
) {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.BILLING_MANAGE,
  })

  return prisma.$transaction(async (tx) => {
    await lockTeamRow(tx, teamId)
    const [team, activeSeats, pendingInvites] = await Promise.all([
      tx.team.findUniqueOrThrow({
        where: { id: teamId },
        select: { seatCapacity: true },
      }),
      tx.teamMember.count({ where: { teamId } }),
      tx.teamInvite.count({
        where: { teamId, expiresAt: { gt: new Date() } },
      }),
    ])
    if (seatCount >= team.seatCapacity) {
      throw new BadRequestError(
        'The new seat count must be lower than your current seats',
      )
    }
    if (seatCount < activeSeats + pendingInvites) {
      throw new ConflictError(
        'Remove members or revoke invites first — the new seat count is below the seats in use',
      )
    }

    await tx.team.update({
      where: { id: teamId },
      data: { scheduledSeatCapacity: seatCount },
    })
    await recordTeamAudit(tx, {
      teamId,
      actorUserId: actorId,
      action: TeamAuditAction.SEAT_REDUCTION_SCHEDULED,
      metadata: { seatCount },
    })
    return { seatCapacity: team.seatCapacity, scheduledSeatCapacity: seatCount }
  })
}

export async function cancelSeatReduction(actorId: string) {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.BILLING_MANAGE,
  })
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { seatCapacity: true, scheduledSeatCapacity: true },
    })
    if (team.scheduledSeatCapacity !== null) {
      await tx.team.update({
        where: { id: teamId },
        data: { scheduledSeatCapacity: null },
      })
      await recordTeamAudit(tx, {
        teamId,
        actorUserId: actorId,
        action: TeamAuditAction.SEAT_REDUCTION_CANCELLED,
      })
    }
    return { seatCapacity: team.seatCapacity, scheduledSeatCapacity: null }
  })
}

// ─── Audit log & export ──────────────────────────────────────────────────────

const collectNames = async (ids: (string | null)[]) => {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))]
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, displayName: true },
  })
  return new Map(users.map((user) => [user.id, user.displayName]))
}

export async function listAuditLog(actorId: string, query: AuditLogQuery) {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.AUDIT_READ,
  })
  if (query.cursor) {
    // A cursor must be one of this workspace's own entries.
    const own = await prisma.teamAuditLog.findFirst({
      where: { id: query.cursor, teamId },
      select: { id: true },
    })
    if (!own) throw new BadRequestError('Invalid cursor')
  }

  // One extra row tells us whether another page exists without a count query.
  const rows = await prisma.teamAuditLog.findMany({
    where: { teamId, ...(query.action ? { action: query.action } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  })
  const hasMore = rows.length > query.limit
  const page = hasMore ? rows.slice(0, query.limit) : rows
  const names = await collectNames(
    page.flatMap((row) => [row.actorUserId, row.targetUserId]),
  )

  return {
    entries: page.map((row) => ({
      id: row.id,
      action: row.action,
      actorUserId: row.actorUserId,
      actorName: row.actorUserId ? (names.get(row.actorUserId) ?? null) : null,
      targetUserId: row.targetUserId,
      targetName: row.targetUserId
        ? (names.get(row.targetUserId) ?? null)
        : null,
      metadata: row.metadata,
      createdAt: row.createdAt,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  }
}

const EXPORT_ROW_CAP = 5_000

/** Owner-only snapshot of the workspace. Capped per section so one export cannot exhaust memory. */
export async function exportTeam(actorId: string) {
  const actor = await requireMembership(actorId, {
    permission: TeamPermission.TEAM_EXPORT,
  })
  const { teamId } = actor
  const take = EXPORT_ROW_CAP

  const [
    team,
    members,
    domains,
    watchlists,
    screeners,
    notes,
    transactions,
    audit,
  ] = await Promise.all([
    prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        status: true,
        seatCapacity: true,
        scheduledSeatCapacity: true,
        orgInstructions: true,
        defaultPreferences: true,
        creditBalanceInPaisa: true,
        createdAt: true,
      },
    }),
    prisma.teamMember.findMany({
      where: { teamId },
      take,
      orderBy: { createdAt: 'asc' },
      select: {
        userId: true,
        role: true,
        monthlyCreditLimitPaisa: true,
        createdAt: true,
        user: { select: { displayName: true, email: true } },
      },
    }),
    prisma.teamDomain.findMany({
      where: { teamId },
      select: { domain: true, isVerified: true, restrictOrgCreation: true },
    }),
    prisma.sharedWatchlist.findMany({ where: { teamId }, take }),
    prisma.sharedScreener.findMany({ where: { teamId }, take }),
    prisma.sharedResearchNote.findMany({ where: { teamId }, take }),
    prisma.paymentTransaction.findMany({
      where: {
        teamId,
        status: { in: [PaymentStatus.COMPLETED, PaymentStatus.REFUNDED] },
      },
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        kind: true,
        status: true,
        amountPaisa: true,
        currency: true,
        seatCount: true,
        createdAt: true,
      },
    }),
    prisma.teamAuditLog.findMany({
      where: { teamId },
      take,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  await recordTeamAudit(prisma, {
    teamId,
    actorUserId: actorId,
    action: TeamAuditAction.TEAM_EXPORTED,
  })

  return {
    exportedAt: new Date().toISOString(),
    team,
    members: members.map((member) => ({
      userId: member.userId,
      displayName: member.user.displayName,
      email: member.user.email,
      role: member.role,
      monthlyCreditLimitPaisa: member.monthlyCreditLimitPaisa,
      joinedAt: member.createdAt,
    })),
    domains,
    sharedWatchlists: watchlists,
    sharedScreeners: screeners,
    researchNotes: notes,
    transactions,
    auditLog: audit,
  }
}
