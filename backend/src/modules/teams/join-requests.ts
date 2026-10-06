import config from '@/config'
import {
  JoinRequestStatus,
  TeamAuditAction,
  TeamJoinPolicy,
  TeamRole,
  TeamStatus,
} from '@prisma/client'
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import {
  emailDomain,
  getActiveMembership,
  TeamPermission,
} from '../../shared/infrastructure/team-access'
import { recordTeamAudit } from '../../shared/infrastructure/team-audit'
import { enqueueTeamJoinRequestEmail } from '../notifications/public'
import { JOIN_REQUEST_COOLDOWN_MS, PUBLIC_EMAIL_DOMAINS } from './constants'
import { requireMembership, seatMember } from './service'

type OpenJoinPolicy = Exclude<TeamJoinPolicy, typeof TeamJoinPolicy.INVITE_ONLY>

export interface JoinOption {
  teamId: string
  teamName: string
  domain: string
  joinPolicy: OpenJoinPolicy
}

/**
 * Domains on which this user could ask to join: verified, owned by a live
 * workspace, and opened up by its admins. Public mailbox domains never match,
 * and a user who already has a workspace has nothing to join.
 */
async function findOpenDomain(
  email: string,
  teamId?: string,
): Promise<{
  domain: string
  joinPolicy: OpenJoinPolicy
  team: { id: string; name: string }
} | null> {
  const domain = emailDomain(email)
  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) return null

  const record = await prisma.teamDomain.findFirst({
    where: {
      domain,
      ...(teamId ? { teamId } : {}),
      isVerified: true,
      joinPolicy: { not: TeamJoinPolicy.INVITE_ONLY },
      team: { status: TeamStatus.ACTIVE },
    },
    select: {
      domain: true,
      joinPolicy: true,
      team: { select: { id: true, name: true } },
    },
  })
  if (!record || record.joinPolicy === TeamJoinPolicy.INVITE_ONLY) return null
  return { ...record, joinPolicy: record.joinPolicy }
}

export async function listJoinOptions(userId: string): Promise<JoinOption[]> {
  if (await getActiveMembership(userId)) return []

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  })
  const open = await findOpenDomain(user.email)
  if (!open) return []
  return [
    {
      teamId: open.team.id,
      teamName: open.team.name,
      domain: open.domain,
      joinPolicy: open.joinPolicy,
    },
  ]
}

export async function getMyJoinRequest(userId: string) {
  const request = await prisma.teamJoinRequest.findFirst({
    where: {
      userId,
      status: JoinRequestStatus.PENDING,
      team: { status: TeamStatus.ACTIVE },
    },
    select: {
      id: true,
      teamId: true,
      createdAt: true,
      team: { select: { name: true } },
    },
  })
  if (!request) return null
  return {
    id: request.id,
    teamId: request.teamId,
    teamName: request.team.name,
    status: JoinRequestStatus.PENDING,
    createdAt: request.createdAt,
  }
}

export async function requestToJoin(
  userId: string,
  teamId: string,
): Promise<{
  teamId: string
  status: typeof JoinRequestStatus.PENDING | typeof JoinRequestStatus.APPROVED
}> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, displayName: true },
  })
  // One message for every "no": a wrong domain, a closed policy and an
  // unknown team must not reveal which workspaces exist.
  const open = await findOpenDomain(user.email, teamId)
  if (!open) {
    throw new NotFoundError('This workspace is not open to join requests')
  }
  if (await getActiveMembership(userId)) {
    throw new ConflictError('You already belong to a workspace')
  }

  if (open.joinPolicy === TeamJoinPolicy.AUTO_APPROVE) {
    await prisma.$transaction(async (tx) => {
      await seatMember(tx, { teamId, userId, role: TeamRole.MEMBER })
      await recordTeamAudit(tx, {
        teamId,
        actorUserId: userId,
        action: TeamAuditAction.JOIN_APPROVED,
        targetUserId: userId,
        metadata: { auto: true },
      })
    })
    return { teamId, status: JoinRequestStatus.APPROVED }
  }

  const existing = await prisma.teamJoinRequest.findUnique({
    where: { teamId_userId: { teamId, userId } },
  })
  if (existing?.status === JoinRequestStatus.PENDING) {
    return { teamId, status: JoinRequestStatus.PENDING }
  }
  if (
    existing?.status === JoinRequestStatus.DECLINED &&
    existing.decidedAt &&
    Date.now() - existing.decidedAt.getTime() < JOIN_REQUEST_COOLDOWN_MS
  ) {
    throw new ConflictError(
      'Your last request was declined recently. Please try again later or contact a workspace admin.',
    )
  }

  const request = await prisma.$transaction(async (tx) => {
    const saved = await tx.teamJoinRequest.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: { teamId, userId },
      update: {
        status: JoinRequestStatus.PENDING,
        decidedBy: null,
        decidedAt: null,
      },
    })
    await recordTeamAudit(tx, {
      teamId,
      actorUserId: userId,
      action: TeamAuditAction.JOIN_REQUESTED,
      targetUserId: userId,
    })
    return saved
  })

  await notifyAdminsOfRequest({
    requestId: request.id,
    teamId,
    teamName: open.team.name,
    requesterName: user.displayName,
  })
  return { teamId, status: JoinRequestStatus.PENDING }
}

export async function cancelMyJoinRequest(userId: string): Promise<void> {
  const { count } = await prisma.teamJoinRequest.updateMany({
    where: { userId, status: JoinRequestStatus.PENDING },
    data: { status: JoinRequestStatus.CANCELLED, decidedAt: new Date() },
  })
  if (count === 0) throw new NotFoundError('You have no pending join request')
}

export async function listJoinRequests(actorId: string) {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.MEMBERS_INVITE,
  })
  const requests = await prisma.teamJoinRequest.findMany({
    where: { teamId, status: JoinRequestStatus.PENDING },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      userId: true,
      status: true,
      createdAt: true,
      user: { select: { displayName: true, email: true } },
    },
  })
  return requests.map(({ user, ...request }) => ({
    ...request,
    displayName: user.displayName,
    email: user.email,
  }))
}

export async function approveJoinRequest(
  actorId: string,
  requestId: string,
): Promise<void> {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.MEMBERS_INVITE,
  })
  const request = await findPendingRequest(teamId, requestId)

  await prisma.$transaction(async (tx) => {
    // The status flip is the guard: a second approver (or a cancel) that got
    // there first leaves nothing to claim. A failed seat rolls it back.
    const claimed = await tx.teamJoinRequest.updateMany({
      where: { id: requestId, status: JoinRequestStatus.PENDING },
      data: {
        status: JoinRequestStatus.APPROVED,
        decidedBy: actorId,
        decidedAt: new Date(),
      },
    })
    if (claimed.count === 0) {
      throw new ConflictError('This request was already handled')
    }
    await seatMember(tx, {
      teamId,
      userId: request.userId,
      role: TeamRole.MEMBER,
    })
    await recordTeamAudit(tx, {
      teamId,
      actorUserId: actorId,
      action: TeamAuditAction.JOIN_APPROVED,
      targetUserId: request.userId,
    })
  })

  await notifyRequester(request, 'APPROVED')
}

export async function declineJoinRequest(
  actorId: string,
  requestId: string,
): Promise<void> {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.MEMBERS_INVITE,
  })
  const request = await findPendingRequest(teamId, requestId)

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.teamJoinRequest.updateMany({
      where: { id: requestId, status: JoinRequestStatus.PENDING },
      data: {
        status: JoinRequestStatus.DECLINED,
        decidedBy: actorId,
        decidedAt: new Date(),
      },
    })
    if (claimed.count === 0) {
      throw new ConflictError('This request was already handled')
    }
    await recordTeamAudit(tx, {
      teamId,
      actorUserId: actorId,
      action: TeamAuditAction.JOIN_DECLINED,
      targetUserId: request.userId,
    })
  })

  await notifyRequester(request, 'DECLINED')
}

export async function setJoinPolicy(
  actorId: string,
  domain: string,
  joinPolicy: TeamJoinPolicy,
) {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.SETTINGS_MANAGE,
  })
  const record = await prisma.teamDomain.findFirst({
    where: { teamId, domain },
  })
  if (!record) throw new NotFoundError('Domain not found in your workspace')
  if (!record.isVerified && joinPolicy !== TeamJoinPolicy.INVITE_ONLY) {
    throw new BadRequestError(
      'Verify the domain before opening it to join requests',
    )
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.teamDomain.update({
      where: { id: record.id },
      data: { joinPolicy },
      select: {
        id: true,
        domain: true,
        isVerified: true,
        restrictOrgCreation: true,
        joinPolicy: true,
      },
    })
    await recordTeamAudit(tx, {
      teamId,
      actorUserId: actorId,
      action: TeamAuditAction.JOIN_POLICY_SET,
      metadata: { domainId: record.id, joinPolicy },
    })
    return updated
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function findPendingRequest(teamId: string, requestId: string) {
  const request = await prisma.teamJoinRequest.findFirst({
    where: { id: requestId, teamId, status: JoinRequestStatus.PENDING },
    select: {
      id: true,
      userId: true,
      user: { select: { email: true, displayName: true } },
      team: { select: { name: true } },
    },
  })
  if (!request) throw new NotFoundError('Join request not found')
  return { ...request, teamId }
}

const workspaceUrl = () => `${config.server.frontendUrl}/teams`

const logQueueFailure = (error: unknown) =>
  logger.error(
    `[Teams] Failed to queue join-request email: ${error instanceof Error ? error.message : String(error)}`,
  )

/** Best-effort: the request is already saved, so a queue failure is logged, not surfaced. */
async function notifyAdminsOfRequest(input: {
  requestId: string
  teamId: string
  teamName: string
  requesterName: string
}): Promise<void> {
  try {
    const admins = await prisma.teamMember.findMany({
      where: {
        teamId: input.teamId,
        role: { in: [TeamRole.OWNER, TeamRole.ADMIN] },
      },
      select: { user: { select: { email: true } } },
    })
    await Promise.all(
      admins.map((admin) =>
        enqueueTeamJoinRequestEmail({
          to: admin.user.email,
          requestId: input.requestId,
          teamId: input.teamId,
          kind: 'REQUESTED',
          teamName: input.teamName,
          requesterName: input.requesterName,
          actionUrl: workspaceUrl(),
        }),
      ),
    )
  } catch (error) {
    logQueueFailure(error)
  }
}

async function notifyRequester(
  request: Awaited<ReturnType<typeof findPendingRequest>>,
  kind: 'APPROVED' | 'DECLINED',
): Promise<void> {
  try {
    await enqueueTeamJoinRequestEmail({
      to: request.user.email,
      requestId: request.id,
      teamId: request.teamId,
      kind,
      teamName: request.team.name,
      requesterName: request.user.displayName,
      actionUrl: workspaceUrl(),
    })
  } catch (error) {
    logQueueFailure(error)
  }
}
