import config from '@/config'
import {
  PlanTier,
  Prisma,
  TeamAuditAction,
  TeamRole,
  TeamStatus,
} from '@prisma/client'
import crypto from 'node:crypto'
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import {
  can,
  effectiveSeatCapacity,
  getActiveMembership,
  isTeamAdminRole,
  releaseLapsedMembership,
  resolveFallbackPlan,
  TeamPermission,
  type ActiveMembership,
} from '../../shared/infrastructure/team-access'
import { recordTeamAudit } from '../../shared/infrastructure/team-audit'
import { hashToken } from '../../shared/utils'
import { enqueueTeamInviteEmail } from '../notifications/public'
import {
  assertCanCreateTeam,
  createSeatAdditionCheckout,
  createTeamCheckout,
  TEAM_MAX_SEATS,
  type CreateCheckoutResult,
} from '../payments/public'
import { INVITE_TTL_MS, PUBLIC_EMAIL_DOMAINS } from './constants'
import {
  checkDomainTxtRecord,
  verificationRecordName,
  verificationRecordValue,
} from './domain-verification'
import {
  storedPreferencesValidator,
  type Preferences,
  type PreferencesPatch,
} from './validation'

// ─── Access helpers ───────────────────────────────────────────────────────────

const OWNER_ONLY_PERMISSIONS: ReadonlySet<TeamPermission> = new Set([
  TeamPermission.MEMBERS_CHANGE_ROLE,
  TeamPermission.OWNERSHIP_TRANSFER,
  TeamPermission.TEAM_DELETE,
  TeamPermission.TEAM_EXPORT,
  TeamPermission.SECURITY_MANAGE,
])

export async function requireMembership(
  userId: string,
  options: { permission?: TeamPermission } = {},
): Promise<ActiveMembership> {
  const membership = await getActiveMembership(userId)
  if (!membership) {
    throw new NotFoundError('You are not part of an active team workspace')
  }
  if (options.permission && !can(membership.role, options.permission)) {
    throw new ForbiddenError(
      OWNER_ONLY_PERMISSIONS.has(options.permission)
        ? 'Only the workspace owner can do this'
        : 'Only a team owner or admin can do this',
    )
  }
  return membership
}

/** Result of creating a workspace or seats: paid flows hand back a checkout, bypass flows the updated state. */
export type PaidActionResult<T> =
  { checkout: CreateCheckoutResult } | { checkout: null; result: T }

// ─── Workspace creation & seats ──────────────────────────────────────────────

export async function createTeam(
  userId: string,
  input: { name: string; seatCount: number },
): Promise<PaidActionResult<{ teamId: string }>> {
  if (config.features.enablePaymentProcessor) {
    // Payment Mode: the workspace only exists once the webhook confirms payment.
    const checkout = await createTeamCheckout(userId, {
      teamName: input.name,
      seatCount: input.seatCount,
    })
    return { checkout }
  }

  // Bypass Mode: instant creation, mirroring the instant /auth/plan switch.
  await assertCanCreateTeam(userId)
  const team = await prisma.$transaction(async (tx) => {
    await releaseLapsedMembership(tx, userId)
    const created = await tx.team.create({
      data: {
        name: input.name,
        ownerId: userId,
        seatCapacity: input.seatCount,
        members: { create: { userId, role: TeamRole.OWNER } },
      },
    })
    await tx.user.update({
      where: { id: userId },
      data: { plan: PlanTier.TEAM },
    })
    return created
  })
  logger.info(`[Teams] Created teamId=${team.id} in bypass mode`)
  return { checkout: null, result: { teamId: team.id } }
}

export async function addSeats(
  userId: string,
  seatCount: number,
): Promise<PaidActionResult<{ seatCapacity: number }>> {
  if (config.features.enablePaymentProcessor) {
    const checkout = await createSeatAdditionCheckout(userId, seatCount)
    return { checkout }
  }

  const { teamId } = await requireMembership(userId, {
    permission: TeamPermission.BILLING_MANAGE,
  })
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } })
  if (team.seatCapacity + seatCount > TEAM_MAX_SEATS) {
    throw new BadRequestError(
      `A workspace can have at most ${TEAM_MAX_SEATS} seats`,
    )
  }
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.team.update({
      where: { id: teamId },
      data: { seatCapacity: { increment: seatCount } },
    })
    await recordTeamAudit(tx, {
      teamId,
      actorUserId: userId,
      action: TeamAuditAction.SEATS_ADDED,
      metadata: { seatCount },
    })
    return next
  })
  return { checkout: null, result: { seatCapacity: updated.seatCapacity } }
}

export async function getMyTeam(userId: string) {
  const membership = await requireMembership(userId)
  const now = new Date()

  const [team, activeSeats, pendingInvites] = await Promise.all([
    prisma.team.findUniqueOrThrow({
      where: { id: membership.teamId },
      include: {
        domains: {
          select: {
            id: true,
            domain: true,
            isVerified: true,
            restrictOrgCreation: true,
            joinPolicy: true,
            authPolicy: true,
          },
        },
        subscription: {
          select: {
            status: true,
            autoRenew: true,
            currentPeriodEnd: true,
            gracePeriodEnd: true,
          },
        },
      },
    }),
    prisma.teamMember.count({ where: { teamId: membership.teamId } }),
    prisma.teamInvite.count({
      where: { teamId: membership.teamId, expiresAt: { gt: now } },
    }),
  ])

  return {
    id: team.id,
    name: team.name,
    status: team.status,
    role: membership.role,
    seats: {
      capacity: team.seatCapacity,
      // Takes effect at the next renewal; invites are already limited to it.
      scheduledCapacity: team.scheduledSeatCapacity,
      active: activeSeats,
      pendingInvites,
      available: Math.max(
        effectiveSeatCapacity(team) - activeSeats - pendingInvites,
        0,
      ),
    },
    // Billing details are for people who manage billing.
    billingEmail: can(membership.role, TeamPermission.BILLING_MANAGE)
      ? team.billingEmail
      : null,
    creditBalanceInPaisa: team.creditBalanceInPaisa,
    orgInstructions: team.orgInstructions,
    domains: team.domains,
    subscription: team.subscription,
  }
}

// ─── Members & invites ───────────────────────────────────────────────────────

/**
 * Everyone in the workspace can see who else is in it; email addresses and
 * credit limits are admin-only details.
 */
export async function listMembers(userId: string) {
  const membership = await requireMembership(userId)
  const isAdmin = isTeamAdminRole(membership.role)

  const members = await prisma.teamMember.findMany({
    where: { teamId: membership.teamId },
    orderBy: { createdAt: 'asc' },
    select: {
      userId: true,
      role: true,
      monthlyCreditLimitPaisa: true,
      createdAt: true,
      user: { select: { displayName: true, email: true } },
    },
  })

  return members.map((member) => ({
    userId: member.userId,
    displayName: member.user.displayName,
    role: member.role,
    joinedAt: member.createdAt,
    ...(isAdmin
      ? {
          email: member.user.email,
          monthlyCreditLimitPaisa: member.monthlyCreditLimitPaisa,
        }
      : {}),
  }))
}

/**
 * Serialises seat-affecting changes for one team. Concurrent invite / accept
 * requests queue on the team row's lock until the holder commits, so the
 * capacity count they read is never stale. Released at commit or rollback.
 */
export const lockTeamRow = async (
  tx: Prisma.TransactionClient,
  teamId: string,
): Promise<void> => {
  await tx.$queryRaw`SELECT id FROM teams WHERE id = ${teamId}::uuid FOR UPDATE`
}

export async function createInvite(
  actorId: string,
  input: { email: string; role: 'ADMIN' | 'MEMBER' },
) {
  const membership = await requireMembership(actorId, {
    permission: TeamPermission.MEMBERS_INVITE,
  })
  if (
    input.role === 'ADMIN' &&
    !can(membership.role, TeamPermission.ADMINS_MANAGE)
  ) {
    throw new ForbiddenError('Only the owner can invite an admin')
  }

  const now = new Date()
  const rawToken = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)

  // Every unexpired invite reserves a seat. The count and the insert happen
  // under one team-row lock, so two admins inviting at once cannot both take
  // the last seat.
  const invite = await prisma.$transaction(async (tx) => {
    await lockTeamRow(tx, membership.teamId)

    const [team, activeSeats, pendingInvites, existingUser] = await Promise.all(
      [
        tx.team.findUniqueOrThrow({
          where: { id: membership.teamId },
          select: { seatCapacity: true, scheduledSeatCapacity: true },
        }),
        tx.teamMember.count({ where: { teamId: membership.teamId } }),
        tx.teamInvite.count({
          where: {
            teamId: membership.teamId,
            expiresAt: { gt: now },
            email: { not: input.email },
          },
        }),
        tx.user.findUnique({
          where: { email: input.email },
          // Only a seat in a live workspace blocks an invite; a lapsed one is released on accept.
          select: {
            teamMembers: {
              where: { team: { status: TeamStatus.ACTIVE } },
              select: { id: true },
            },
          },
        }),
      ],
    )

    if (existingUser?.teamMembers.length) {
      throw new ConflictError('That user already belongs to a workspace')
    }
    // `pendingInvites` excludes this email, so re-inviting it never double-counts.
    if (activeSeats + pendingInvites >= effectiveSeatCapacity(team)) {
      throw new ConflictError(
        'No seats available — add seats before inviting more people',
      )
    }

    await tx.teamInvite.deleteMany({
      where: { teamId: membership.teamId, email: input.email },
    })
    const created = await tx.teamInvite.create({
      data: {
        teamId: membership.teamId,
        email: input.email,
        role: input.role,
        token: hashToken(rawToken),
        expiresAt,
      },
    })
    await recordTeamAudit(tx, {
      teamId: membership.teamId,
      actorUserId: actorId,
      action: TeamAuditAction.MEMBER_INVITED,
      metadata: { inviteId: created.id, role: input.role },
    })
    return created
  })

  const inviteLink = `${config.server.frontendUrl}/teams/invite?token=${rawToken}`
  const emailQueued = await dispatchInviteEmail(actorId, invite, inviteLink)

  return {
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
    },
    // The raw token is shown once; only its hash is stored.
    inviteLink,
    emailQueued,
  }
}

/**
 * Queues the invite email. Delivery is best-effort: the invite is already
 * saved and its link returned to the inviter, so a queue/lookup failure is
 * logged and reported as `false` instead of failing the request.
 */
export async function dispatchInviteEmail(
  inviterId: string,
  invite: {
    id: string
    email: string
    role: TeamRole
    expiresAt: Date
    teamId: string
  },
  inviteUrl: string,
): Promise<boolean> {
  try {
    const [inviter, team] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: inviterId },
        select: { displayName: true },
      }),
      prisma.team.findUniqueOrThrow({
        where: { id: invite.teamId },
        select: { name: true },
      }),
    ])
    await enqueueTeamInviteEmail({
      to: invite.email,
      inviteId: invite.id,
      teamId: invite.teamId,
      inviterName: inviter.displayName,
      teamName: team.name,
      inviteUrl,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    })
    return true
  } catch (error) {
    logger.error(
      `[Teams] Failed to queue invite email: ${error instanceof Error ? error.message : String(error)}`,
    )
    return false
  }
}

/**
 * The one place a person takes a seat, shared by invite acceptance and the
 * join-request flows so capacity and one-workspace-per-user are enforced
 * identically. Locks the team row, releases a lapsed membership, re-reads
 * capacity under the lock (it may have changed since the caller looked), then
 * seats the user and moves them onto the TEAM plan. Must run inside `tx`.
 */
export async function seatMember(
  tx: Prisma.TransactionClient,
  seat: { teamId: string; userId: string; role: TeamRole },
): Promise<void> {
  await lockTeamRow(tx, seat.teamId)

  await releaseLapsedMembership(tx, seat.userId)
  if (await tx.teamMember.findUnique({ where: { userId: seat.userId } })) {
    throw new ConflictError('You already belong to a workspace')
  }
  const [team, seated] = await Promise.all([
    tx.team.findUniqueOrThrow({
      where: { id: seat.teamId },
      select: { seatCapacity: true, scheduledSeatCapacity: true },
    }),
    tx.teamMember.count({ where: { teamId: seat.teamId } }),
  ])
  if (seated >= effectiveSeatCapacity(team)) {
    throw new ConflictError('This workspace has no free seats')
  }
  await tx.teamMember.create({
    data: { teamId: seat.teamId, userId: seat.userId, role: seat.role },
  })
  await tx.user.update({
    where: { id: seat.userId },
    data: { plan: PlanTier.TEAM },
  })
}

export async function acceptInvite(userId: string, rawToken: string) {
  const invite = await prisma.teamInvite.findUnique({
    where: { token: hashToken(rawToken) },
    include: { team: { select: { status: true, seatCapacity: true } } },
  })
  if (!invite || invite.expiresAt <= new Date()) {
    throw new NotFoundError('Invite not found or expired')
  }
  if (invite.team.status !== TeamStatus.ACTIVE) {
    throw new BadRequestError('This workspace is no longer active')
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  })
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw new ForbiddenError('This invite was issued to a different email')
  }

  await prisma.$transaction(async (tx) => {
    await seatMember(tx, {
      teamId: invite.teamId,
      userId,
      role: invite.role,
    })
    await tx.teamInvite.delete({ where: { id: invite.id } })
    await recordTeamAudit(tx, {
      teamId: invite.teamId,
      actorUserId: userId,
      action: TeamAuditAction.INVITE_ACCEPTED,
      metadata: { role: invite.role },
    })
  })

  return { teamId: invite.teamId, role: invite.role }
}

/**
 * Hard delete: the @@unique([userId]) slot frees immediately so the user can
 * later join or create another workspace, and they drop back to their
 * personal plan.
 */
export async function detachMember(
  tx: Prisma.TransactionClient,
  memberId: string,
  userId: string,
): Promise<void> {
  await tx.teamMember.delete({ where: { id: memberId } })
  await tx.user.update({
    where: { id: userId },
    data: { plan: await resolveFallbackPlan(userId, tx) },
  })
}

export async function removeMember(actorId: string, targetUserId: string) {
  const actor = await requireMembership(actorId, {
    permission: TeamPermission.MEMBERS_REMOVE,
  })
  if (targetUserId === actorId) {
    throw new ForbiddenError('Use "Leave workspace" to remove yourself')
  }
  const target = await prisma.teamMember.findUnique({
    where: { userId: targetUserId },
  })
  if (target?.teamId !== actor.teamId) {
    throw new NotFoundError('Member not found in your workspace')
  }
  if (target.role === TeamRole.OWNER) {
    throw new ForbiddenError('The workspace owner cannot be removed')
  }
  if (
    target.role === TeamRole.ADMIN &&
    !can(actor.role, TeamPermission.ADMINS_MANAGE)
  ) {
    throw new ForbiddenError('Only the owner can remove an admin')
  }

  await prisma.$transaction(async (tx) => {
    await detachMember(tx, target.id, targetUserId)
    await recordTeamAudit(tx, {
      teamId: actor.teamId,
      actorUserId: actorId,
      action: TeamAuditAction.MEMBER_REMOVED,
      targetUserId,
      metadata: { role: target.role },
    })
  })
}

// ─── Domains ─────────────────────────────────────────────────────────────────

export async function addDomain(
  actorId: string,
  input: { domain: string; restrictOrgCreation: boolean },
) {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.SETTINGS_MANAGE,
  })
  if (PUBLIC_EMAIL_DOMAINS.has(input.domain)) {
    throw new BadRequestError('Public email providers cannot be claimed')
  }

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.teamDomain.create({
      data: {
        teamId,
        domain: input.domain,
        restrictOrgCreation: input.restrictOrgCreation,
        verificationToken: crypto.randomBytes(16).toString('hex'),
      },
    })
    await recordTeamAudit(tx, {
      teamId,
      actorUserId: actorId,
      action: TeamAuditAction.DOMAIN_ADDED,
      metadata: { domainId: created.id },
    })
    return created
  })
  return verifyAndDescribe(record, { teamId, actorId })
}

export async function verifyDomain(actorId: string, domain: string) {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.SETTINGS_MANAGE,
  })
  const record = await prisma.teamDomain.findFirst({
    where: { teamId, domain },
  })
  if (!record) throw new NotFoundError('Domain not found in your workspace')
  return verifyAndDescribe(record, { teamId, actorId })
}

async function verifyAndDescribe(
  record: {
    id: string
    domain: string
    verificationToken: string
    isVerified: boolean
    restrictOrgCreation: boolean
  },
  context: { teamId: string; actorId: string },
) {
  const verified =
    record.isVerified ||
    (await checkDomainTxtRecord(record.domain, record.verificationToken))
  if (verified && !record.isVerified) {
    await prisma.$transaction(async (tx) => {
      await tx.teamDomain.update({
        where: { id: record.id },
        data: { isVerified: true },
      })
      await recordTeamAudit(tx, {
        teamId: context.teamId,
        actorUserId: context.actorId,
        action: TeamAuditAction.DOMAIN_VERIFIED,
        metadata: { domainId: record.id },
      })
    })
  }
  return {
    id: record.id,
    domain: record.domain,
    isVerified: verified,
    restrictOrgCreation: record.restrictOrgCreation,
    // Shown so the admin can publish the record when verification is pending.
    verification: {
      recordType: 'TXT',
      recordName: verificationRecordName(record.domain),
      recordValue: verificationRecordValue(record.verificationToken),
    },
  }
}

// ─── Instructions, spend controls & preferences ──────────────────────────────

export async function updateInstructions(
  actorId: string,
  orgInstructions: string | null,
) {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.SETTINGS_MANAGE,
  })
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.update({
      where: { id: teamId },
      data: { orgInstructions: orgInstructions || null },
      select: { orgInstructions: true },
    })
    await recordTeamAudit(tx, {
      teamId,
      actorUserId: actorId,
      action: TeamAuditAction.SETTINGS_UPDATED,
      metadata: { setting: 'orgInstructions' },
    })
    return team
  })
}

export async function setMemberCreditLimit(
  actorId: string,
  targetUserId: string,
  monthlyCreditLimitPaisa: number | null,
) {
  const actor = await requireMembership(actorId, {
    permission: TeamPermission.CREDITS_MANAGE,
  })
  const target = await prisma.teamMember.findUnique({
    where: { userId: targetUserId },
  })
  if (target?.teamId !== actor.teamId) {
    throw new NotFoundError('Member not found in your workspace')
  }
  if (target.role === TeamRole.OWNER) {
    throw new ForbiddenError('The workspace owner has no credit limit')
  }
  if (
    target.role === TeamRole.ADMIN &&
    !can(actor.role, TeamPermission.ADMINS_MANAGE)
  ) {
    throw new ForbiddenError('Only the owner can set an admin credit limit')
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.teamMember.update({
      where: { id: target.id },
      data: { monthlyCreditLimitPaisa },
      select: { userId: true, monthlyCreditLimitPaisa: true },
    })
    await recordTeamAudit(tx, {
      teamId: actor.teamId,
      actorUserId: actorId,
      action: TeamAuditAction.CREDIT_LIMIT_SET,
      targetUserId,
      metadata: { unlimited: monthlyCreditLimitPaisa === null },
    })
    return updated
  })
}

// Anything that is not a preferences object (null, a string, an array…) reads as empty.
const asPreferences = (value: Prisma.JsonValue | null): Preferences => {
  const parsed = storedPreferencesValidator.safeParse(value ?? {})
  return parsed.success ? parsed.data : {}
}

/** Applies a patch to stored preferences: values set, `null` clears, omitted keys are kept. */
const applyPreferencePatch = (
  current: Preferences,
  patch: PreferencesPatch,
): Preferences => {
  const merged = { ...current, ...patch }
  const next: Preferences = {}
  if (merged.theme) next.theme = merged.theme
  if (merged.chartLayout) next.chartLayout = merged.chartLayout
  if (merged.indicators) next.indicators = merged.indicators
  return next
}

/** Workspace defaults first, the caller's own preferences layered on top. */
export async function getPreferences(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { preferences: true },
  })
  const membership = await getActiveMembership(userId)
  const team = membership
    ? await prisma.team.findUnique({
        where: { id: membership.teamId },
        select: { defaultPreferences: true },
      })
    : null

  const workspace = asPreferences(team?.defaultPreferences ?? null)
  const personal = asPreferences(user.preferences)
  return { workspace, personal, effective: { ...workspace, ...personal } }
}

export async function updateMyPreferences(
  userId: string,
  patch: PreferencesPatch,
) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { preferences: true },
  })
  await prisma.user.update({
    where: { id: userId },
    data: {
      preferences: applyPreferencePatch(asPreferences(user.preferences), patch),
    },
  })
  return getPreferences(userId)
}

export async function updateWorkspacePreferences(
  actorId: string,
  patch: PreferencesPatch,
) {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.SETTINGS_MANAGE,
  })
  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
    select: { defaultPreferences: true },
  })
  await prisma.$transaction(async (tx) => {
    await tx.team.update({
      where: { id: teamId },
      data: {
        defaultPreferences: applyPreferencePatch(
          asPreferences(team.defaultPreferences),
          patch,
        ),
      },
    })
    await recordTeamAudit(tx, {
      teamId,
      actorUserId: actorId,
      action: TeamAuditAction.SETTINGS_UPDATED,
      metadata: { setting: 'defaultPreferences' },
    })
  })
  return getPreferences(actorId)
}
