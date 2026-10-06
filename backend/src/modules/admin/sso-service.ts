import {
  AdminAuditAction,
  DomainAuthPolicy,
  TeamAuditAction,
  type Prisma,
} from '@prisma/client'
import { ConflictError, NotFoundError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { revokeSsoSessions } from '../../shared/infrastructure/team-access'
import { recordTeamAudit } from '../../shared/infrastructure/team-audit'
import {
  AdminTargetType,
  logAdminAction,
  logAdminRead,
} from '../access-control'
import { certificateExpiry, createSsoProvider } from '../sso'
import type { AdminReadContext, AdminWriteContext } from './types'

const SSO_AUDIT_ACTIONS: readonly TeamAuditAction[] = [
  TeamAuditAction.SAML_CONFIG_UPDATED,
  TeamAuditAction.SAML_ENABLED,
  TeamAuditAction.SAML_DISABLED,
]
const RECENT_ACTIVITY_LIMIT = 20

/** Loads a domain by its (globally unique) name; staff act across workspaces. */
const findDomain = async (domain: string) => {
  const record = await prisma.teamDomain.findUnique({
    where: { domain },
    include: { ssoConnection: true },
  })
  if (!record) throw new NotFoundError('Domain not found')
  return record
}

/** Staff put a domain that required SSO back to any method (so nobody is locked out) and record why on the team's trail. */
const recordPolicyFreed = (
  tx: Prisma.TransactionClient,
  record: { id: string; teamId: string },
  adminId: string,
) =>
  recordTeamAudit(tx, {
    teamId: record.teamId,
    actorUserId: adminId,
    action: TeamAuditAction.AUTH_POLICY_SET,
    metadata: {
      domainId: record.id,
      authPolicy: DomainAuthPolicy.ANY,
      reset: true,
    },
  })

/**
 * What staff need to diagnose a customer's SSO: how it is set up, whether it
 * has been tested, how many people are signed in through it, and the recent
 * configuration trail. Identifiers and settings only; never certificates.
 */
export async function getTeamSso(ctx: AdminReadContext, domain: string) {
  const record = await findDomain(domain)
  const connection = record.ssoConnection

  const [activity, activeSsoSessions] = await Promise.all([
    prisma.teamAuditLog.findMany({
      where: { teamId: record.teamId, action: { in: [...SSO_AUDIT_ACTIONS] } },
      orderBy: { createdAt: 'desc' },
      take: RECENT_ACTIVITY_LIMIT,
      select: {
        id: true,
        action: true,
        actorUserId: true,
        metadata: true,
        createdAt: true,
      },
    }),
    record.ssoTenantId
      ? prisma.userSession.count({
          where: {
            ssoTenantId: record.ssoTenantId,
            isRevoked: false,
            expiresAt: { gt: new Date() },
          },
        })
      : 0,
  ])

  await logAdminRead(prisma, {
    adminId: ctx.adminId,
    ipAddress: ctx.ipAddress,
    targetType: AdminTargetType.TEAM_DOMAIN,
    resultIds: [record.id],
  })

  return {
    domain: record.domain,
    domainId: record.id,
    teamId: record.teamId,
    authPolicy: record.authPolicy,
    enabled: record.samlEnabled,
    configured: connection !== null,
    idpEntityId: connection?.idpEntityId ?? null,
    idpSsoUrl: connection?.idpSsoUrl ?? null,
    certificateExpiresAt: connection
      ? certificateExpiry(connection.idpCertificate)
      : null,
    testedAt: connection?.testedAt ?? null,
    lastLoginAt: connection?.lastLoginAt ?? null,
    updatedByUserId: connection?.updatedByUserId ?? null,
    activeSsoSessions,
    recentActivity: activity,
  }
}

/**
 * Emergency off-switch for a customer whose IdP is broken. Turns SSO off and,
 * when the domain required it, puts the domain back to accepting any sign-in
 * method (otherwise nobody could get in). SSO sessions are signed out.
 */
export async function disableSso(ctx: AdminWriteContext, domain: string) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.teamDomain.findUnique({ where: { domain } })
    if (!record) throw new NotFoundError('Domain not found')
    const wasRequired = record.authPolicy === DomainAuthPolicy.SAML_SSO
    if (!record.samlEnabled && !wasRequired) {
      throw new ConflictError('SSO is already disabled for this domain')
    }

    await tx.teamDomain.update({
      where: { id: record.id },
      data: {
        samlEnabled: false,
        ...(wasRequired ? { authPolicy: DomainAuthPolicy.ANY } : {}),
      },
    })
    const revokedSessions = await revokeSsoSessions(tx, record.ssoTenantId)
    if (wasRequired) await recordPolicyFreed(tx, record, ctx.adminId)
    await recordTeamAudit(tx, {
      teamId: record.teamId,
      actorUserId: ctx.adminId,
      action: TeamAuditAction.SAML_DISABLED,
      metadata: { domainId: record.id, revokedSessions, byStaff: true },
    })
    await logAdminAction(tx, {
      adminId: ctx.adminId,
      action: AdminAuditAction.SAML_DISABLED,
      targetType: AdminTargetType.TEAM_DOMAIN,
      targetId: record.id,
      reason: ctx.reason,
      ticketRef: ctx.ticketRef,
      ipAddress: ctx.ipAddress,
      metadata: {
        teamId: record.teamId,
        domain,
        previousPolicy: record.authPolicy,
        revokedSessions,
      },
    })

    return {
      domain,
      teamId: record.teamId,
      enabled: false,
      authPolicy: wasRequired ? DomainAuthPolicy.ANY : record.authPolicy,
      revokedSessions,
    }
  })
}

/**
 * Removes a broken SSO connection altogether so the customer can start again.
 * Like `disableSso`, a domain that required SSO goes back to any method.
 */
export async function resetSso(ctx: AdminWriteContext, domain: string) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.teamDomain.findUnique({ where: { domain } })
    if (!record) throw new NotFoundError('Domain not found')
    if (!record.ssoTenantId) {
      throw new ConflictError('SSO is not configured for this domain')
    }
    const wasRequired = record.authPolicy === DomainAuthPolicy.SAML_SSO

    const revokedSessions = await revokeSsoSessions(tx, record.ssoTenantId)
    await createSsoProvider(tx).deleteConnection(record.ssoTenantId)
    await tx.teamDomain.update({
      where: { id: record.id },
      data: {
        ssoTenantId: null,
        samlEnabled: false,
        ...(wasRequired ? { authPolicy: DomainAuthPolicy.ANY } : {}),
      },
    })
    if (wasRequired) await recordPolicyFreed(tx, record, ctx.adminId)
    await recordTeamAudit(tx, {
      teamId: record.teamId,
      actorUserId: ctx.adminId,
      action: TeamAuditAction.SAML_CONFIG_UPDATED,
      metadata: {
        domainId: record.id,
        removed: true,
        revokedSessions,
        byStaff: true,
      },
    })
    await logAdminAction(tx, {
      adminId: ctx.adminId,
      action: AdminAuditAction.SAML_CONFIG_RESET,
      targetType: AdminTargetType.TEAM_DOMAIN,
      targetId: record.id,
      reason: ctx.reason,
      ticketRef: ctx.ticketRef,
      ipAddress: ctx.ipAddress,
      metadata: {
        teamId: record.teamId,
        domain,
        previousPolicy: record.authPolicy,
        revokedSessions,
      },
    })

    return {
      domain,
      teamId: record.teamId,
      authPolicy: wasRequired ? DomainAuthPolicy.ANY : record.authPolicy,
      revokedSessions,
    }
  })
}
