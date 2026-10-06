import config from '@/config'
import {
  DomainAuthPolicy,
  TeamAuditAction,
  type TeamDomain,
  type TeamSsoConnection,
} from '@prisma/client'
import {
  BadRequestError,
  ConflictError,
  FeatureDisabledError,
  NotFoundError,
} from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import {
  revokeSsoSessions,
  TeamPermission,
} from '../../shared/infrastructure/team-access'
import { recordTeamAudit } from '../../shared/infrastructure/team-audit'
import {
  certificateExpiry,
  createSsoProvider,
  fetchMetadataDocument,
  parseIdpMetadata,
  serviceProviderFor,
  SsoConfigSource,
  SsoConfigurationError,
  startSsoTest,
  type SsoConnectionConfig,
} from '../sso'
import { requireMembership } from './service'
import type { SsoConfigInput } from './validation'

type DomainWithConnection = TeamDomain & {
  ssoConnection: TeamSsoConnection | null
}

export interface SsoConfigView {
  domain: string
  authPolicy: DomainAuthPolicy
  /** Whether people on the domain can sign in with SSO (set after a passing test). */
  enabled: boolean
  configured: boolean
  /** Give these two values to the IdP. */
  spEntityId: string
  acsUrl: string
  idpEntityId: string | null
  idpSsoUrl: string | null
  certificateExpiresAt: Date | null
  testedAt: Date | null
  lastLoginAt: Date | null
}

const view = (record: DomainWithConnection): SsoConfigView => {
  const connection = record.ssoConnection
  const sp = serviceProviderFor(record.id)
  return {
    domain: record.domain,
    authPolicy: record.authPolicy,
    enabled: record.samlEnabled,
    configured: connection !== null,
    spEntityId: sp.spEntityId,
    acsUrl: sp.acsUrl,
    idpEntityId: connection?.idpEntityId ?? null,
    idpSsoUrl: connection?.idpSsoUrl ?? null,
    certificateExpiresAt: connection
      ? certificateExpiry(connection.idpCertificate)
      : null,
    testedAt: connection?.testedAt ?? null,
    lastLoginAt: connection?.lastLoginAt ?? null,
  }
}

/** Authorises the actor for SSO management and loads their workspace's domain, never anyone else's. */
async function loadDomain(
  actorId: string,
  domain: string,
  permission: TeamPermission = TeamPermission.SSO_MANAGE,
): Promise<{ teamId: string; record: DomainWithConnection }> {
  if (!config.features.enableSso) {
    throw new FeatureDisabledError('Single sign-on is not enabled')
  }
  const { teamId } = await requireMembership(actorId, { permission })
  const record = await prisma.teamDomain.findFirst({
    where: { teamId, domain },
    include: { ssoConnection: true },
  })
  if (!record) throw new NotFoundError('Domain not found in your workspace')
  return { teamId, record }
}

const reload = async (domainId: string): Promise<SsoConfigView> =>
  view(
    await prisma.teamDomain.findUniqueOrThrow({
      where: { id: domainId },
      include: { ssoConnection: true },
    }),
  )

/** While SSO is required, changing or removing the connection could lock everyone out. */
const assertNotEnforced = (record: TeamDomain): void => {
  if (record.authPolicy === DomainAuthPolicy.SAML_SSO) {
    throw new ConflictError(
      'Change the sign-in policy away from SSO before changing the connection',
    )
  }
}

/** Turns what the admin supplied into IdP settings; anything wrong with it is theirs to fix (400). */
async function resolveConfig(
  input: SsoConfigInput,
): Promise<{ config: SsoConnectionConfig; metadataXml: string | null }> {
  try {
    switch (input.source) {
      case SsoConfigSource.METADATA_XML:
        return {
          config: parseIdpMetadata(input.metadataXml),
          metadataXml: input.metadataXml,
        }
      case SsoConfigSource.METADATA_URL: {
        const xml = await fetchMetadataDocument(input.metadataUrl)
        return { config: parseIdpMetadata(xml), metadataXml: xml }
      }
      case SsoConfigSource.MANUAL:
        return {
          config: {
            idpEntityId: input.idpEntityId,
            idpSsoUrl: input.idpSsoUrl,
            idpCertificate: input.idpCertificate,
          },
          metadataXml: null,
        }
    }
  } catch (error) {
    if (error instanceof SsoConfigurationError) {
      throw new BadRequestError(error.message)
    }
    throw error
  }
}

export async function getSsoConfig(
  actorId: string,
  domain: string,
): Promise<SsoConfigView> {
  const { record } = await loadDomain(actorId, domain)
  return view(record)
}

/** Saves the IdP's settings. A changed connection must pass a fresh test and be re-enabled. */
export async function saveSsoConfig(
  actorId: string,
  domain: string,
  input: SsoConfigInput,
): Promise<SsoConfigView> {
  const { teamId, record } = await loadDomain(actorId, domain)
  if (!record.isVerified) {
    throw new BadRequestError('Verify the domain before configuring SSO')
  }
  assertNotEnforced(record)
  const { config: idp, metadataXml } = await resolveConfig(input)

  try {
    await prisma.$transaction(async (tx) => {
      await tx.teamDomain.update({
        where: { id: record.id },
        data: { ssoTenantId: record.id, samlEnabled: false },
      })
      await createSsoProvider(tx).upsertConnection(record.id, idp, {
        updatedByUserId: actorId,
      })
      await tx.teamSsoConnection.update({
        where: { domainId: record.id },
        data: { idpMetadataXml: metadataXml },
      })
      await recordTeamAudit(tx, {
        teamId,
        actorUserId: actorId,
        action: TeamAuditAction.SAML_CONFIG_UPDATED,
        metadata: {
          domainId: record.id,
          source: input.source,
          disabled: record.samlEnabled,
        },
      })
    })
  } catch (error) {
    if (error instanceof SsoConfigurationError) {
      throw new BadRequestError(error.message)
    }
    throw error
  }
  return reload(record.id)
}

export async function deleteSsoConfig(
  actorId: string,
  domain: string,
): Promise<{ revokedSessions: number }> {
  const { teamId, record } = await loadDomain(actorId, domain)
  assertNotEnforced(record)
  if (!record.ssoConnection) {
    throw new NotFoundError('SSO is not configured for this domain')
  }

  return prisma.$transaction(async (tx) => {
    const revokedSessions = await revokeSsoSessions(tx, record.ssoTenantId)
    await createSsoProvider(tx).deleteConnection(record.ssoTenantId ?? '')
    await tx.teamDomain.update({
      where: { id: record.id },
      data: { ssoTenantId: null, samlEnabled: false },
    })
    await recordTeamAudit(tx, {
      teamId,
      actorUserId: actorId,
      action: TeamAuditAction.SAML_CONFIG_UPDATED,
      metadata: { domainId: record.id, removed: true, revokedSessions },
    })
    return { revokedSessions }
  })
}

/**
 * Switching SSO on is the owner's decision: whoever controls the IdP settings can
 * assert any email on the domain, so an admin who may configure it must not also
 * be able to turn it on. Enabling needs a passing test; disabling (any manager)
 * is refused while SSO is required, and signs SSO users out.
 */
export async function setSsoEnabled(
  actorId: string,
  domain: string,
  enabled: boolean,
): Promise<SsoConfigView> {
  const { teamId, record } = await loadDomain(
    actorId,
    domain,
    enabled ? TeamPermission.SECURITY_MANAGE : TeamPermission.SSO_MANAGE,
  )
  if (!record.ssoConnection) {
    throw new BadRequestError('Configure SSO before enabling it')
  }
  if (enabled && !record.ssoConnection.testedAt) {
    throw new BadRequestError('Complete a successful test sign-in first')
  }
  if (!enabled) assertNotEnforced(record)

  await prisma.$transaction(async (tx) => {
    await tx.teamDomain.update({
      where: { id: record.id },
      data: { samlEnabled: enabled },
    })
    const revokedSessions = enabled
      ? 0
      : await revokeSsoSessions(tx, record.ssoTenantId)
    await recordTeamAudit(tx, {
      teamId,
      actorUserId: actorId,
      action: enabled
        ? TeamAuditAction.SAML_ENABLED
        : TeamAuditAction.SAML_DISABLED,
      metadata: { domainId: record.id, revokedSessions },
    })
  })
  return reload(record.id)
}

/** Begins the "Test SSO connection" sign-in; the browser is sent to the IdP. */
export async function startSsoConnectionTest(
  actorId: string,
  actorSessionId: string | undefined,
  domain: string,
): Promise<{ redirectUrl: string }> {
  const { record } = await loadDomain(actorId, domain)
  if (!record.isVerified || !record.ssoConnection || !record.ssoTenantId) {
    throw new BadRequestError('Configure SSO before testing it')
  }
  return startSsoTest({
    tenantId: record.ssoTenantId,
    actorUserId: actorId,
    actorSessionId,
  })
}
