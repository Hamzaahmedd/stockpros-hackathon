import { DomainAuthPolicy, TeamAuditAction } from '@prisma/client'
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import {
  emailDomain,
  isLoginAllowedByPolicy,
  nonCompliantSessionWhere,
  TeamPermission,
} from '../../shared/infrastructure/team-access'
import { recordTeamAudit } from '../../shared/infrastructure/team-audit'
import { requireMembership } from './service'

/**
 * The owner is about to change how everyone on a domain may sign in, so the
 * change must not lock the owner out: if their own email is on that domain,
 * the session making the request has to already satisfy the new policy.
 */
async function assertOwnerKeepsAccess(
  actorId: string,
  actorSessionId: string | undefined,
  domain: string,
  policy: DomainAuthPolicy,
  domainSsoTenantId: string | null,
): Promise<void> {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { id: actorId },
    select: { email: true },
  })
  if (emailDomain(owner.email) !== domain) return

  const session = actorSessionId
    ? await prisma.userSession.findFirst({
        where: { id: actorSessionId, userId: actorId, isRevoked: false },
        select: { loginMethod: true, googleHd: true, ssoTenantId: true },
      })
    : null
  const compliant =
    session !== null &&
    isLoginAllowedByPolicy(
      policy,
      domain,
      {
        method: session.loginMethod,
        googleHd: session.googleHd,
        ssoTenantId: session.ssoTenantId,
      },
      domainSsoTenantId,
    )
  if (!compliant) {
    throw new ConflictError(
      'Sign in with Google (with your Google Workspace account for this domain if you choose Workspace only) before enforcing this policy, or you would lock yourself out',
    )
  }
}

/** SAML_SSO is only enforceable once a connection exists, is enabled and passed its test sign-in. */
async function assertSsoReady(
  domainId: string,
  samlEnabled: boolean,
): Promise<void> {
  const connection = await prisma.teamSsoConnection.findUnique({
    where: { domainId },
    select: { testedAt: true },
  })
  if (!samlEnabled || !connection?.testedAt) {
    throw new BadRequestError(
      'Configure SSO and complete a successful test sign-in before requiring it',
    )
  }
}

/**
 * Sets how people on a verified domain may sign in. Owner only. Stricter
 * policies need the domain typed back as confirmation, must leave the owner
 * able to sign in, and immediately sign out every session on the domain that
 * would not satisfy the new policy (the owner's current session is kept).
 */
export async function setAuthPolicy(
  actorId: string,
  actorSessionId: string | undefined,
  domain: string,
  input: { authPolicy: DomainAuthPolicy; confirmDomain?: string },
) {
  const { teamId } = await requireMembership(actorId, {
    permission: TeamPermission.SECURITY_MANAGE,
  })
  const record = await prisma.teamDomain.findFirst({
    where: { teamId, domain },
  })
  if (!record) throw new NotFoundError('Domain not found in your workspace')

  if (input.authPolicy === DomainAuthPolicy.SAML_SSO) {
    await assertSsoReady(record.id, record.samlEnabled)
  }

  const restricting = input.authPolicy !== DomainAuthPolicy.ANY
  if (restricting) {
    if (!record.isVerified) {
      throw new BadRequestError('Verify the domain before restricting sign-in')
    }
    if (input.confirmDomain !== domain) {
      throw new BadRequestError('Type the domain to confirm this change')
    }
    await assertOwnerKeepsAccess(
      actorId,
      actorSessionId,
      domain,
      input.authPolicy,
      record.ssoTenantId,
    )
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.teamDomain.update({
      where: { id: record.id },
      data: { authPolicy: input.authPolicy },
      select: {
        id: true,
        domain: true,
        isVerified: true,
        restrictOrgCreation: true,
        joinPolicy: true,
        authPolicy: true,
      },
    })

    const nonCompliant = nonCompliantSessionWhere(
      input.authPolicy,
      domain,
      record.ssoTenantId,
    )
    const revoked = nonCompliant
      ? await tx.userSession.updateMany({
          where: {
            AND: [
              { isRevoked: false },
              {
                user: {
                  email: { endsWith: `@${domain}`, mode: 'insensitive' },
                },
              },
              ...(actorSessionId ? [{ id: { not: actorSessionId } }] : []),
              nonCompliant,
            ],
          },
          data: { isRevoked: true },
        })
      : { count: 0 }

    await recordTeamAudit(tx, {
      teamId,
      actorUserId: actorId,
      action: TeamAuditAction.AUTH_POLICY_SET,
      metadata: {
        domainId: record.id,
        authPolicy: input.authPolicy,
        revokedSessions: revoked.count,
      },
    })
    return { ...updated, revokedSessions: revoked.count }
  })
}
