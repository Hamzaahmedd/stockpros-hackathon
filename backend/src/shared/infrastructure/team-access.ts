import {
  DomainAuthPolicy,
  LoginMethod,
  PlanTier,
  SubscriptionStatus,
  TeamRole,
  TeamStatus,
  type Prisma,
  type PrismaClient,
} from '@prisma/client'
import { LoginMethodRequiredError } from '../errors'
import { prisma } from './database'

type DbClient = PrismaClient | Prisma.TransactionClient

/** Everything a workspace member can be authorised to do. Checked through `can()`, never by comparing role names. */
export enum TeamPermission {
  MEMBERS_INVITE = 'MEMBERS_INVITE',
  ANALYTICS_READ = 'ANALYTICS_READ',
  MEMBERS_REMOVE = 'MEMBERS_REMOVE',
  MEMBERS_CHANGE_ROLE = 'MEMBERS_CHANGE_ROLE',
  ADMINS_MANAGE = 'ADMINS_MANAGE',
  CREDITS_MANAGE = 'CREDITS_MANAGE',
  BILLING_MANAGE = 'BILLING_MANAGE',
  SETTINGS_MANAGE = 'SETTINGS_MANAGE',
  AUDIT_READ = 'AUDIT_READ',
  OWNERSHIP_TRANSFER = 'OWNERSHIP_TRANSFER',
  TEAM_DELETE = 'TEAM_DELETE',
  TEAM_EXPORT = 'TEAM_EXPORT',
  SECURITY_MANAGE = 'SECURITY_MANAGE',
}

const ADMIN_PERMISSIONS: readonly TeamPermission[] = [
  TeamPermission.MEMBERS_INVITE,
  TeamPermission.MEMBERS_REMOVE,
  TeamPermission.CREDITS_MANAGE,
  TeamPermission.BILLING_MANAGE,
  TeamPermission.SETTINGS_MANAGE,
  TeamPermission.AUDIT_READ,
  TeamPermission.ANALYTICS_READ,
]

// A single table, so custom (Enterprise) roles can later be rows instead of code.
const ROLE_PERMISSIONS: Readonly<
  Record<TeamRole, ReadonlySet<TeamPermission>>
> = {
  [TeamRole.OWNER]: new Set(Object.values(TeamPermission)),
  [TeamRole.ADMIN]: new Set(ADMIN_PERMISSIONS),
  [TeamRole.MEMBER]: new Set(),
}

export const can = (role: TeamRole, permission: TeamPermission): boolean =>
  // Optional chain: a role outside the enum (bad data) has no permissions.
  ROLE_PERMISSIONS[role]?.has(permission) ?? false

/** Owners and admins manage a workspace (billing, members, settings); plain members do not. */
export const isTeamAdminRole = (role: TeamRole): boolean =>
  can(role, TeamPermission.SETTINGS_MANAGE)

export interface ActiveMembership {
  teamId: string
  role: TeamRole
  monthlyCreditLimitPaisa: number | null
  orgInstructions: string | null
}

/**
 * Read model shared by payments, teams and plan-gating so none of them import
 * each other. Only memberships of an ACTIVE team count — a cancelled team's
 * members fall back to their personal plan.
 */
export async function getActiveMembership(
  userId: string,
  client: DbClient = prisma,
): Promise<ActiveMembership | null> {
  const member = await client.teamMember.findUnique({
    where: { userId },
    include: { team: { select: { status: true, orgInstructions: true } } },
  })
  if (member?.team.status !== TeamStatus.ACTIVE) return null

  return {
    teamId: member.teamId,
    role: member.role,
    monthlyCreditLimitPaisa: member.monthlyCreditLimitPaisa,
    orgInstructions: member.team.orgInstructions,
  }
}

export const emailDomain = (email: string): string =>
  email.split('@')[1]?.toLowerCase() ?? ''

/** A verified domain whose owner has locked workspace creation to its admins. */
export async function findRestrictingDomain(email: string) {
  const domain = emailDomain(email)
  if (!domain) return null
  return prisma.teamDomain.findFirst({
    where: { domain, isVerified: true, restrictOrgCreation: true },
  })
}

// ─── Login enforcement (per verified domain) ────────────────────────────────

/** What is known about how a user signed in (a login attempt, or a stored session). */
export interface LoginEvidence {
  /** Null on sessions that predate enforcement: unknown, so never compliant. */
  method: LoginMethod | null
  /** The Google Workspace domain (`hd` claim) of the account, when it has one. */
  googleHd?: string | null
}

/** Pure policy check: does this evidence satisfy `policy` for users of `domain`? */
export const isLoginAllowedByPolicy = (
  policy: DomainAuthPolicy,
  domain: string,
  evidence: LoginEvidence,
): boolean => {
  switch (policy) {
    case DomainAuthPolicy.ANY:
      return true
    case DomainAuthPolicy.GOOGLE_ONLY:
      return evidence.method === LoginMethod.GOOGLE
    case DomainAuthPolicy.GOOGLE_WORKSPACE:
      return (
        evidence.method === LoginMethod.GOOGLE &&
        evidence.googleHd?.toLowerCase() === domain
      )
  }
}

/** The enforcing policy for an email's domain, or null when it is unrestricted. */
export async function findAuthRestriction(email: string) {
  const domain = emailDomain(email)
  if (!domain) return null
  return prisma.teamDomain.findFirst({
    where: {
      domain,
      isVerified: true,
      authPolicy: { not: DomainAuthPolicy.ANY },
      team: { status: TeamStatus.ACTIVE },
    },
    select: { domain: true, authPolicy: true },
  })
}

const REQUIRED_METHOD_MESSAGES: Record<
  Exclude<DomainAuthPolicy, typeof DomainAuthPolicy.ANY>,
  string
> = {
  [DomainAuthPolicy.GOOGLE_ONLY]:
    'Your organization requires signing in with Google',
  [DomainAuthPolicy.GOOGLE_WORKSPACE]:
    'Your organization requires signing in with your Google Workspace account',
}

/**
 * Throws `LoginMethodRequiredError` when the email's verified domain restricts
 * sign-in and this method (or Google Workspace `hd`) does not satisfy it.
 */
export async function assertLoginAllowed(
  email: string,
  method: LoginMethod | null,
  googleHd?: string | null,
): Promise<void> {
  const restriction = await findAuthRestriction(email)
  if (
    restriction &&
    restriction.authPolicy !== DomainAuthPolicy.ANY &&
    !isLoginAllowedByPolicy(restriction.authPolicy, restriction.domain, {
      method,
      googleHd,
    })
  ) {
    throw new LoginMethodRequiredError(
      REQUIRED_METHOD_MESSAGES[restriction.authPolicy],
    )
  }
}

/** Sessions that would no longer satisfy `policy` for `domain`, as a Prisma filter (null = nothing is non-compliant). */
export const nonCompliantSessionWhere = (
  policy: DomainAuthPolicy,
  domain: string,
): Prisma.UserSessionWhereInput | null => {
  switch (policy) {
    case DomainAuthPolicy.ANY:
      return null
    case DomainAuthPolicy.GOOGLE_ONLY:
      return {
        OR: [
          { loginMethod: null },
          { loginMethod: { not: LoginMethod.GOOGLE } },
        ],
      }
    case DomainAuthPolicy.GOOGLE_WORKSPACE:
      return {
        OR: [
          { loginMethod: null },
          { loginMethod: { not: LoginMethod.GOOGLE } },
          { googleHd: null },
          { googleHd: { not: domain } },
        ],
      }
  }
}

/**
 * The plan a user returns to once a team plan ends: PRO if a personal
 * subscription is still live, otherwise FREE.
 */
export async function resolveFallbackPlan(
  userId: string,
  client: DbClient = prisma,
): Promise<PlanTier> {
  const personal = await client.subscription.findUnique({ where: { userId } })
  const live =
    personal?.planTier === PlanTier.PRO &&
    (personal.status === SubscriptionStatus.ACTIVE ||
      personal.status === SubscriptionStatus.GRACE)
  return live ? PlanTier.PRO : PlanTier.FREE
}

/**
 * Seats the workspace can actually fill: a scheduled reduction takes effect
 * for invites immediately (it only reaches billing at renewal), so nobody can
 * schedule a smaller plan and then invite past it.
 */
export const effectiveSeatCapacity = (team: {
  seatCapacity: number
  scheduledSeatCapacity: number | null
}): number =>
  Math.min(team.seatCapacity, team.scheduledSeatCapacity ?? team.seatCapacity)

/**
 * A seat in a workspace that is no longer ACTIVE (lapsed) still holds the
 * user's one-workspace slot so a renewal can restore its members. Joining or
 * creating another workspace releases it first — otherwise those people would
 * be stuck on a workspace they can neither use nor leave. A renewal then
 * restores only the members still attached.
 */
export async function releaseLapsedMembership(
  client: DbClient,
  userId: string,
): Promise<void> {
  await client.teamMember.deleteMany({
    where: { userId, team: { status: { not: TeamStatus.ACTIVE } } },
  })
}
