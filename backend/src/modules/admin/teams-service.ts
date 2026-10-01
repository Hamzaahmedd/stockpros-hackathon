import { AdminAuditAction, TeamAuditAction, TeamRole } from '@prisma/client'
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { effectiveSeatCapacity } from '../../shared/infrastructure/team-access'
import { recordTeamAudit } from '../../shared/infrastructure/team-audit'
import {
  AdminTargetType,
  logAdminAction,
  logAdminRead,
} from '../access-control'
import { TEAM_MIN_SEATS } from '../payments/public'
import { UUID_PATTERN } from './constants'
import { isMaskingEnabled, maskIdentity } from './masking'
import { detachMemberTx } from './team-members'
import type { AdminReadContext, AdminWriteContext } from './types'

export async function searchTeams(
  ctx: AdminReadContext,
  query: string,
  limit: number,
) {
  const teams = await prisma.team.findMany({
    where: {
      OR: [
        ...(UUID_PATTERN.test(query) ? [{ id: query }] : []),
        { name: { contains: query, mode: 'insensitive' } },
        { owner: { email: { contains: query, mode: 'insensitive' } } },
      ],
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      status: true,
      seatCapacity: true,
      scheduledSeatCapacity: true,
      orgInstructions: true,
      creditBalanceInPaisa: true,
      createdAt: true,
      owner: { select: { id: true, displayName: true, email: true } },
      domains: { select: { id: true, domain: true, isVerified: true } },
      members: {
        select: {
          role: true,
          user: { select: { id: true, displayName: true, email: true } },
        },
      },
      subscription: {
        select: { id: true, status: true, currentPeriodEnd: true },
      },
    },
  })

  await logAdminRead(prisma, {
    adminId: ctx.adminId,
    ipAddress: ctx.ipAddress,
    targetType: AdminTargetType.TEAM,
    resultIds: teams.map((team) => team.id),
  })

  return teams.map((team) => {
    const capacity = effectiveSeatCapacity(team)
    return {
      ...team,
      owner: maskIdentity(team.owner),
      members: team.members.map((member) => ({
        ...member,
        user: maskIdentity(member.user),
      })),
      piiMasked: isMaskingEnabled(),
      seatsUsed: team.members.length,
      effectiveSeatCapacity: capacity,
      seatUtilization: `${team.members.length}/${capacity}`,
    }
  })
}

/**
 * Sets a custom seat ceiling for an enterprise deal. Clears any scheduled seat
 * reduction so the renewal job cannot overwrite the negotiated cap.
 */
export async function setSeatCapacity(
  ctx: AdminWriteContext,
  teamId: string,
  seatCapacity: number,
) {
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({
      where: { id: teamId },
      select: { id: true, seatCapacity: true, scheduledSeatCapacity: true },
    })
    if (!team) throw new NotFoundError('Team not found')

    const [members, pendingInvites] = await Promise.all([
      tx.teamMember.count({ where: { teamId } }),
      tx.teamInvite.count({ where: { teamId, expiresAt: { gt: new Date() } } }),
    ])
    const floor = Math.max(TEAM_MIN_SEATS, members + pendingInvites)
    if (seatCapacity < floor) {
      throw new BadRequestError(
        `seatCapacity cannot be below ${floor} (${members} members + ${pendingInvites} pending invites)`,
      )
    }

    await tx.team.update({
      where: { id: teamId },
      data: { seatCapacity, scheduledSeatCapacity: null },
    })

    await recordTeamAudit(tx, {
      teamId,
      actorUserId: ctx.adminId,
      action: TeamAuditAction.SEATS_ADDED,
      metadata: {
        from: team.seatCapacity,
        to: seatCapacity,
        viaAdminOverride: true,
      },
    })
    await logAdminAction(tx, {
      adminId: ctx.adminId,
      action: AdminAuditAction.SEAT_CAPACITY_OVERRIDE,
      targetType: AdminTargetType.TEAM,
      targetId: teamId,
      reason: ctx.reason,
      ticketRef: ctx.ticketRef,
      ipAddress: ctx.ipAddress,
      metadata: {
        previousCapacity: team.seatCapacity,
        newCapacity: seatCapacity,
        clearedScheduledCapacity: team.scheduledSeatCapacity,
      },
    })

    return { teamId, seatCapacity, scheduledSeatCapacity: null }
  })
}

/** Marks a domain verified without a DNS TXT check. */
export async function forceVerifyDomain(
  ctx: AdminWriteContext,
  domainId: string,
) {
  return prisma.$transaction(async (tx) => {
    const domain = await tx.teamDomain.findUnique({ where: { id: domainId } })
    if (!domain) throw new NotFoundError('Domain not found')
    if (domain.isVerified) throw new ConflictError('Domain is already verified')

    await tx.teamDomain.update({
      where: { id: domainId },
      data: { isVerified: true },
    })
    await recordTeamAudit(tx, {
      teamId: domain.teamId,
      actorUserId: ctx.adminId,
      action: TeamAuditAction.DOMAIN_VERIFIED,
      metadata: { forced: true },
    })
    await logAdminAction(tx, {
      adminId: ctx.adminId,
      action: AdminAuditAction.DOMAIN_FORCE_VERIFIED,
      targetType: AdminTargetType.TEAM_DOMAIN,
      targetId: domainId,
      reason: ctx.reason,
      ticketRef: ctx.ticketRef,
      ipAddress: ctx.ipAddress,
      metadata: { teamId: domain.teamId, domain: domain.domain },
    })

    return { domainId, teamId: domain.teamId, isVerified: true }
  })
}

/** Hard-removes a member (never the owner) so their seat frees instantly. */
export async function forceRemoveMember(
  ctx: AdminWriteContext,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const member = await tx.teamMember.findUnique({ where: { userId } })
    if (!member) {
      throw new NotFoundError('User is not a member of any workspace')
    }
    if (member.role === TeamRole.OWNER) {
      throw new ConflictError(
        'The workspace owner cannot be removed: transfer ownership first',
      )
    }

    await detachMemberTx(tx, member)
    await recordTeamAudit(tx, {
      teamId: member.teamId,
      actorUserId: ctx.adminId,
      action: TeamAuditAction.MEMBER_REMOVED,
      targetUserId: userId,
      metadata: { role: member.role, viaAdmin: true },
    })
    await logAdminAction(tx, {
      adminId: ctx.adminId,
      action: AdminAuditAction.MEMBER_FORCE_REMOVED,
      targetType: AdminTargetType.USER,
      targetId: userId,
      reason: ctx.reason,
      ticketRef: ctx.ticketRef,
      ipAddress: ctx.ipAddress,
      metadata: { teamId: member.teamId, role: member.role },
    })

    return { userId, teamId: member.teamId }
  })
}
