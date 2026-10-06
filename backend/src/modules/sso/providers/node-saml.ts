import {
  SAML,
  ValidateInResponseTo,
  type CacheProvider,
  type Profile,
} from '@node-saml/node-saml'
import { z } from 'zod'
import {
  splitCertificates,
  validateConnectionConfig,
} from '../connection-config'
import {
  SsoVerificationError,
  type SsoCallbackPayload,
  type SsoConnectionConfig,
  type SsoConnectionStore,
  type SsoIdentity,
  type SsoProvider,
  type SsoRequestCache,
  type SsoServiceProviderInfo,
  type SsoWriteContext,
} from '../provider'

const REQUEST_TTL_MS = 5 * 60 * 1000
const ACCEPTED_CLOCK_SKEW_MS = 60 * 1000
const MAX_ASSERTION_AGE_MS = 10 * 60 * 1000
const EMAIL_NAME_ID_FORMAT = 'emailaddress'

/** Attribute names IdPs commonly use for the user's email, in priority order. */
const EMAIL_ATTRIBUTES: readonly string[] = [
  'email',
  'mail',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  'urn:oid:0.9.2342.19200300.100.1.3',
]

const emailSchema = z.string().trim().toLowerCase().email()

export interface NodeSamlProviderOptions {
  store: SsoConnectionStore
  requestCache: SsoRequestCache
  /** SP identity for a tenant; the ACS URL is where the IdP posts its response. */
  serviceProvider: (tenantId: string) => SsoServiceProviderInfo
  now?: () => Date
}

/** Scopes request ids to a tenant so one tenant's response can never consume another's request. */
const tenantCache = (
  cache: SsoRequestCache,
  tenantId: string,
): CacheProvider => {
  const scoped = (key: string) => `${tenantId}:${key}`
  return {
    saveAsync: async (key, value) => {
      await cache.save(scoped(key), value, REQUEST_TTL_MS)
      return { value, createdAt: Date.now() }
    },
    getAsync: (key) => cache.get(scoped(key)),
    removeAsync: async (key) => (key === null ? null : cache.take(scoped(key))),
  }
}

const readAttribute = (value: unknown): string | readonly string[] | null => {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return value
  }
  return null
}

const extractAttributes = (
  profile: Profile,
): Record<string, string | readonly string[]> => {
  const attributes: Record<string, string | readonly string[]> = {}
  for (const [name, raw] of Object.entries(profile)) {
    const value = readAttribute(raw)
    if (value !== null) attributes[name] = value
  }
  return attributes
}

const extractEmail = (profile: Profile): string => {
  const candidates: unknown[] = EMAIL_ATTRIBUTES.map((name) => profile[name])
  if (profile.nameIDFormat?.toLowerCase().includes(EMAIL_NAME_ID_FORMAT)) {
    candidates.push(profile.nameID)
  }
  for (const candidate of candidates) {
    const value = Array.isArray(candidate) ? candidate[0] : candidate
    const parsed = emailSchema.safeParse(value)
    if (parsed.success) return parsed.data
  }
  throw new SsoVerificationError('The assertion carries no usable email')
}

/** SAML 2.0 service provider built on `@node-saml/node-saml` (HTTP-Redirect out, HTTP-POST in). */
export class NodeSamlProvider implements SsoProvider {
  private readonly now: () => Date

  constructor(private readonly options: NodeSamlProviderOptions) {
    this.now = options.now ?? (() => new Date())
  }

  async upsertConnection(
    tenantId: string,
    config: SsoConnectionConfig,
    context?: SsoWriteContext,
  ): Promise<SsoServiceProviderInfo> {
    const valid = validateConnectionConfig(config, this.now())
    await this.options.store.save(tenantId, valid, context)
    return this.options.serviceProvider(tenantId)
  }

  async deleteConnection(tenantId: string): Promise<void> {
    await this.options.store.remove(tenantId)
  }

  async startLogin(
    tenantId: string,
    relayState: string,
  ): Promise<{ redirectUrl: string }> {
    const saml = await this.samlFor(tenantId)
    const redirectUrl = await saml.getAuthorizeUrlAsync(
      relayState,
      undefined,
      {},
    )
    return { redirectUrl }
  }

  async completeLogin(payload: SsoCallbackPayload): Promise<SsoIdentity> {
    const saml = await this.samlFor(payload.tenantId)
    let profile: Profile | null
    try {
      const result = await saml.validatePostResponseAsync({
        SAMLResponse: payload.samlResponse,
      })
      profile = result.profile
    } catch (error) {
      throw new SsoVerificationError('SAML response failed verification', {
        cause: error,
      })
    }
    const requestId = profile?.inResponseTo
    if (!profile?.nameID || typeof requestId !== 'string') {
      throw new SsoVerificationError('SAML response carried no subject')
    }
    return {
      tenantId: payload.tenantId,
      email: extractEmail(profile),
      nameId: profile.nameID,
      requestId,
      attributes: extractAttributes(profile),
    }
  }

  private async samlFor(tenantId: string): Promise<SAML> {
    const connection = await this.options.store.get(tenantId)
    if (!connection) {
      throw new SsoVerificationError('No SSO connection for this tenant')
    }
    const sp = this.options.serviceProvider(tenantId)
    return new SAML({
      issuer: sp.spEntityId,
      callbackUrl: sp.acsUrl,
      audience: sp.spEntityId,
      entryPoint: connection.idpSsoUrl,
      idpIssuer: connection.idpEntityId,
      idpCert: splitCertificates(connection.idpCertificate),
      // The assertion itself must be signed; an unsigned assertion inside a signed envelope is refused.
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: false,
      // Every response must answer a request we issued, and each request id is single-use.
      validateInResponseTo: ValidateInResponseTo.always,
      requestIdExpirationPeriodMs: REQUEST_TTL_MS,
      cacheProvider: tenantCache(this.options.requestCache, tenantId),
      acceptedClockSkewMs: ACCEPTED_CLOCK_SKEW_MS,
      maxAssertionAgeMs: MAX_ASSERTION_AGE_MS,
      disableRequestedAuthnContext: true,
    })
  }
}
