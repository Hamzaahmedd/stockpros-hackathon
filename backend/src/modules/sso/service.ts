import config from '@/config'
import {
  LoginMethod,
  TeamAuditAction,
  type Prisma,
  type PrismaClient,
} from '@prisma/client'
import { BadRequestError, UnauthorizedError } from '../../shared/errors'
import { prisma } from '../../shared/infrastructure/database'
import { logger } from '../../shared/infrastructure/logger'
import { recordTeamAudit } from '../../shared/infrastructure/team-audit'
import {
  findSsoDomainForEmail,
  findSsoTenantForEmail,
} from '../../shared/infrastructure/team-access'
import { ssoSignIn } from '../auth'
import { createConnectionStore, createRequestCache } from './connection-store'
import { NodeSamlProvider } from './providers/node-saml'
import {
  SsoVerificationError,
  type SsoProvider,
  type SsoServiceProviderInfo,
} from './provider'
import {
  bindingMatches,
  claimResponse,
  consumeExchangeCode,
  consumeFlowState,
  createBinding,
  createExchangeCode,
  createFlowState,
  type SsoFlowState,
} from './state'
import { SsoCallbackOutcome, SsoFlowPurpose } from './types'

type DbClient = PrismaClient | Prisma.TransactionClient

export const SSO_ROUTE_BASE = '/api/v1/auth/sso'

/** What the customer's IdP is configured with. The tenant id is the domain's id. */
export const serviceProviderFor = (
  tenantId: string,
): SsoServiceProviderInfo => {
  const base = `${config.server.apiPublicUrl}${SSO_ROUTE_BASE}/${tenantId}`
  return { spEntityId: base, acsUrl: `${base}/acs` }
}

/** The configured provider. Pass a transaction client to write inside it. */
export const createSsoProvider = (client?: DbClient): SsoProvider =>
  new NodeSamlProvider({
    store: createConnectionStore(client),
    requestCache: createRequestCache(),
    serviceProvider: serviceProviderFor,
  })

/** Starts a real sign-in for an email whose domain has SSO enabled. */
export async function startSsoLogin(
  rawEmail: string,
): Promise<{ redirectUrl: string; bindingToken: string }> {
  const tenantId = await findSsoTenantForEmail(rawEmail.toLowerCase().trim())
  if (!tenantId) {
    throw new BadRequestError('SSO is not available for this email')
  }
  const binding = createBinding()
  const relayState = await createFlowState({
    tenantId,
    purpose: SsoFlowPurpose.LOGIN,
    bindingHash: binding.hash,
  })
  const { redirectUrl } = await createSsoProvider().startLogin(
    tenantId,
    relayState,
  )
  return { redirectUrl, bindingToken: binding.token }
}

/** Starts the admin's "Test SSO connection" round trip. The caller has already authorised the actor for this tenant. */
export async function startSsoTest(params: {
  tenantId: string
  actorUserId: string
  actorSessionId?: string
}): Promise<{ redirectUrl: string }> {
  const relayState = await createFlowState({
    tenantId: params.tenantId,
    purpose: SsoFlowPurpose.TEST,
    actorUserId: params.actorUserId,
    actorSessionId: params.actorSessionId,
  })
  return createSsoProvider().startLogin(params.tenantId, relayState)
}

/**
 * A passing test proves the IdP works end to end: it marks the connection as
 * tested and, when the person who passed it is the admin who started it,
 * upgrades that admin's own session to an SSO session (needed before the
 * `SAML_SSO` policy can be enforced without locking them out).
 */
async function recordTestPassed(
  state: SsoFlowState,
  email: string,
): Promise<boolean> {
  const domain = await findSsoDomainForEmail(state.tenantId, email, {
    requireEnabled: false,
  })
  if (!domain) return false

  const actor = state.actorUserId
    ? await prisma.user.findUnique({
        where: { id: state.actorUserId },
        select: { email: true },
      })
    : null
  const isActor = actor?.email.toLowerCase() === email

  await prisma.teamSsoConnection.update({
    where: { domainId: domain.id },
    data: { testedAt: new Date() },
  })
  let sessionUpgraded = false
  if (isActor && state.actorUserId && state.actorSessionId) {
    const upgraded = await prisma.userSession.updateMany({
      where: {
        id: state.actorSessionId,
        userId: state.actorUserId,
        isRevoked: false,
      },
      data: { loginMethod: LoginMethod.SSO, ssoTenantId: state.tenantId },
    })
    sessionUpgraded = upgraded.count > 0
  }
  await recordTeamAudit(prisma, {
    teamId: domain.teamId,
    actorUserId: state.actorUserId,
    action: TeamAuditAction.SAML_CONFIG_UPDATED,
    metadata: { domainId: domain.id, tested: true, sessionUpgraded },
  })
  return true
}

const failure = (state: SsoFlowState | null): SsoCallbackOutcome =>
  state?.purpose === SsoFlowPurpose.TEST
    ? SsoCallbackOutcome.TEST_FAILED
    : SsoCallbackOutcome.LOGIN_FAILED

/**
 * Handles the IdP's POST to the ACS URL. Everything that can go wrong with an
 * untrusted response ends as a failed outcome (never an error page with
 * details); only genuine server faults throw.
 */
export async function handleSsoCallback(params: {
  tenantId: string
  samlResponse: string
  relayState?: string
}): Promise<{ outcome: SsoCallbackOutcome; code?: string }> {
  const state = params.relayState
    ? await consumeFlowState(params.relayState)
    : null
  if (state?.tenantId !== params.tenantId) {
    logger.warn('[SSO] callback with unknown or mismatched state', {
      tenantId: params.tenantId,
    })
    return { outcome: failure(null) }
  }

  let identity
  try {
    identity = await createSsoProvider().completeLogin({
      tenantId: params.tenantId,
      samlResponse: params.samlResponse,
    })
  } catch (error) {
    if (!(error instanceof SsoVerificationError)) throw error
    logger.warn('[SSO] assertion rejected', {
      tenantId: params.tenantId,
      purpose: state.purpose,
      reason: error.message,
      // What the SAML library objected to (expired, bad signature...): operational detail, never user data.
      detail: error.cause instanceof Error ? error.cause.message : undefined,
    })
    return { outcome: failure(state) }
  }

  if (!(await claimResponse(identity.tenantId, identity.requestId))) {
    logger.warn('[SSO] replayed response refused', {
      tenantId: params.tenantId,
    })
    return { outcome: failure(state) }
  }

  if (state.purpose === SsoFlowPurpose.TEST) {
    const passed = await recordTestPassed(state, identity.email)
    return {
      outcome: passed
        ? SsoCallbackOutcome.TEST_PASSED
        : SsoCallbackOutcome.TEST_FAILED,
    }
  }

  if (
    !state.bindingHash ||
    !(await findSsoDomainForEmail(identity.tenantId, identity.email))
  ) {
    logger.warn('[SSO] login refused for identity outside its domain', {
      tenantId: params.tenantId,
    })
    return { outcome: SsoCallbackOutcome.LOGIN_FAILED }
  }
  const code = await createExchangeCode({
    tenantId: identity.tenantId,
    email: identity.email,
    bindingHash: state.bindingHash,
  })
  return { outcome: SsoCallbackOutcome.LOGIN_READY, code }
}

/** Swaps the one-time code plus the browser's own binding token for a session. */
export async function exchangeSsoCode(
  params: { code: string; bindingToken: string },
  ip: string,
  userAgent: string,
) {
  const payload = await consumeExchangeCode(params.code)
  if (!payload || !bindingMatches(params.bindingToken, payload.bindingHash)) {
    throw new UnauthorizedError('Invalid or expired SSO sign-in')
  }
  const result = await ssoSignIn(
    { tenantId: payload.tenantId, email: payload.email },
    ip,
    userAgent,
  )
  await prisma.teamSsoConnection.updateMany({
    where: { domain: { ssoTenantId: payload.tenantId } },
    data: { lastLoginAt: new Date() },
  })
  return result
}
