import {
  PlanTier,
  SubscriptionStatus,
  TeamRole,
  TeamStatus,
  type Prisma,
  type PrismaClient,
} from '@prisma/client'
import { prisma } from './database'

type DbClient = PrismaClient | Prisma.TransactionClient

const TEAM_ADMIN_ROLES: ReadonlySet<TeamRole> = new Set([
  TeamRole.OWNER,
  TeamRole.ADMIN,
])

/** Owners and admins manage a workspace (billing, members, settings); plain members do not. */
export const isTeamAdminRole = (role: TeamRole): boolean =>
  TEAM_ADMIN_ROLES.has(role)

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
