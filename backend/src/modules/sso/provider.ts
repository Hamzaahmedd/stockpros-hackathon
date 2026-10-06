/**
 * Port for enterprise SSO. Everything protocol- or vendor-specific (SAML
 * libraries, hosted brokers) sits behind it, so callers only ever see a
 * verified identity and the broker can be swapped without touching them.
 */

/** Public IdP settings of one tenant (a verified domain). Contains no secrets. */
export interface SsoConnectionConfig {
  idpEntityId: string
  idpSsoUrl: string
  /** PEM or bare base64 X.509 certificate used to verify the IdP's signatures. */
  idpCertificate: string
}

/** What the customer pastes into their IdP to trust this application. */
export interface SsoServiceProviderInfo {
  spEntityId: string
  acsUrl: string
}

/** An identity the IdP has vouched for, after signature, audience, time and replay checks. */
export interface SsoIdentity {
  tenantId: string
  /** Lower-cased. Callers must still check it belongs to the tenant's verified domain. */
  email: string
  nameId: string
  /** The AuthnRequest this answers; each is single-use, so it keys the caller's replay guard. */
  requestId: string
  attributes: Readonly<Record<string, string | readonly string[]>>
}

export interface SsoCallbackPayload {
  tenantId: string
  /** The base64 `SAMLResponse` form field the IdP posted to the ACS URL. */
  samlResponse: string
}

/** Who is making a change, recorded with the stored connection. */
export interface SsoWriteContext {
  updatedByUserId?: string
}

export interface SsoProvider {
  /** Validates and stores the IdP settings, returning the values to give the IdP. */
  upsertConnection(
    tenantId: string,
    config: SsoConnectionConfig,
    context?: SsoWriteContext,
  ): Promise<SsoServiceProviderInfo>
  deleteConnection(tenantId: string): Promise<void>
  /** Starts a sign-in. `relayState` is echoed back by the IdP and is the caller's to sign and check. */
  startLogin(
    tenantId: string,
    relayState: string,
  ): Promise<{ redirectUrl: string }>
  /** Throws `SsoVerificationError` for anything that is not a fully verified, unreplayed assertion. */
  completeLogin(payload: SsoCallbackPayload): Promise<SsoIdentity>
}

/** Where connections live; implemented over the database in the service layer. */
export interface SsoConnectionStore {
  get(tenantId: string): Promise<SsoConnectionConfig | null>
  save(
    tenantId: string,
    config: SsoConnectionConfig,
    context?: SsoWriteContext,
  ): Promise<void>
  remove(tenantId: string): Promise<void>
}

/**
 * Short-lived store for in-flight request ids. An id is consumed on first use,
 * which is what stops a captured SAML response being replayed.
 */
export interface SsoRequestCache {
  save(key: string, value: string, ttlMs: number): Promise<void>
  get(key: string): Promise<string | null>
  /** Atomically reads and deletes the entry. */
  take(key: string): Promise<string | null>
}

/** Raised when a callback cannot be trusted; the message is safe to log, never to show. */
export class SsoVerificationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'SsoVerificationError'
  }
}

/** Raised when stored or submitted IdP settings are unusable; the message is safe to show. */
export class SsoConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SsoConfigurationError'
  }
}
