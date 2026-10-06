import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { SignedXml } from 'xml-crypto'
import type {
  SsoConnectionConfig,
  SsoConnectionStore,
  SsoRequestCache,
} from '../provider'

// Self-signed, public-only certificate valid 2026-10-06 to 2126-09-12 (test fixture, no private key kept).
export const TEST_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIURFVIdbeepkKtHdK4V3H6pK9lM+AwDQYJKoZIhvcNAQEL
BQAwEzERMA8GA1UEAwwIdGVzdC1pZHAwIBcNMjYxMDA2MTE0MTQ3WhgPMjEyNjA5
MTIxMTQxNDdaMBMxETAPBgNVBAMMCHRlc3QtaWRwMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAruXDE3pJcK6WQw1Xp3dTbXB10MiOq5gLGLWSIctcTxvj
K67HljlLTwvkjoLIOU+zvNPhFxAOlecn9tX3J7kJr0wI3NisAKLmAysSuPR9x4Kw
d9qRrwDnQ5Z46OweMwHnhmIxvahl0kfxrAuNEED0Nv6BQglVadKQh6iVrnQJEvtX
yZDJJxMrpEBmLEwzr8p7uZTEXz4qyB51b52/bTq6FVnj/ALq32vLWFstJEn5Bn/p
TdjuDJDpZSFECtcaeNik1Sex/4N4IhJUmXymMLzrWmcaxPME8reWZmo8DhccAI6l
KlUTbN/E/3YjXuIpCytVL8kGxPppt6vn3LEozJwE8QIDAQABo1MwUTAdBgNVHQ4E
FgQU/tL8BugWydTMHntCkTZEa0rrt80wHwYDVR0jBBgwFoAU/tL8BugWydTMHntC
kTZEa0rrt80wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAep6P
k5b6xhLur0cblPEYx7ALAoLEY9ShbXrNpVrIQtfxDtdoKR+DITfjQkOUpaBGc8u3
2Bwqpy3ZagEy1qAfPHHu5eKW+pTsPr8r0wggwls3HcLQfLePfz0T9lITDIXZiv1k
eklKxw22l6uiRieS6bblCc2qjI9n4bq0ILz29OVdVeHwSCzuJ0tVCgsIuHw/KjbE
1RXjkPPNbdMuvAdKpFQesG0vn92wmrmdFkzoF4kCgRhc+FZ0H7bQpZPR+OlGU0xw
FZfZygkbiuckX84xnINQ7R1IEJMw/63fi/XqR80tMkB57I96KC+0NXZME+rqdV9d
7h64CI1cyD4JUNMIWQ==
-----END CERTIFICATE-----`

/** A throwaway IdP signing key pair, generated fresh for each test run. */
export const makeIdpKeys = (): { privateKey: string; publicKey: string } =>
  crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

/** The `ID` of the AuthnRequest inside the redirect URL `startLogin` returned. */
export const requestIdFrom = (redirectUrl: string): string => {
  const encoded = new URL(redirectUrl).searchParams.get('SAMLRequest') ?? ''
  const xml = zlib.inflateRawSync(Buffer.from(encoded, 'base64')).toString()
  const match = /ID="([^"]+)"/.exec(xml)
  if (!match) throw new Error('No request id in SAMLRequest')
  return match[1]
}

export interface ResponseOptions {
  privateKey: string
  requestId: string
  idpEntityId: string
  spEntityId: string
  acsUrl: string
  email?: string
  /** Use a non-email NameID and carry the email as an attribute instead. */
  emailAttribute?: string
  audience?: string
  assertionId?: string
  sign?: boolean
}

const iso = (offsetMs: number): string =>
  new Date(Date.now() + offsetMs).toISOString()

/** A SAML Response with a (by default signed) assertion, base64-encoded as an IdP would post it. */
export const buildResponse = (options: ResponseOptions): string => {
  const assertionId = options.assertionId ?? `_a${crypto.randomUUID()}`
  const nameId = options.emailAttribute
    ? '<saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">opaque-id</saml:NameID>'
    : `<saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${options.email}</saml:NameID>`
  const attributes = options.emailAttribute
    ? `<saml:AttributeStatement><saml:Attribute Name="email"><saml:AttributeValue>${options.emailAttribute}</saml:AttributeValue></saml:Attribute></saml:AttributeStatement>`
    : ''

  const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r${crypto.randomUUID()}" Version="2.0" IssueInstant="${iso(0)}" Destination="${options.acsUrl}" InResponseTo="${options.requestId}"><saml:Issuer>${options.idpEntityId}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status><saml:Assertion ID="${assertionId}" Version="2.0" IssueInstant="${iso(0)}"><saml:Issuer>${options.idpEntityId}</saml:Issuer><saml:Subject>${nameId}<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${iso(300_000)}" Recipient="${options.acsUrl}" InResponseTo="${options.requestId}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${iso(-60_000)}" NotOnOrAfter="${iso(300_000)}"><saml:AudienceRestriction><saml:Audience>${options.audience ?? options.spEntityId}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${iso(0)}" SessionIndex="_s1"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>${attributes}</saml:Assertion></samlp:Response>`

  if (options.sign === false) return Buffer.from(xml).toString('base64')

  const signer = new SignedXml({
    privateKey: options.privateKey,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  })
  signer.addReference({
    xpath: "//*[local-name(.)='Assertion']",
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  })
  signer.computeSignature(xml, {
    location: {
      reference: "//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']",
      action: 'after',
    },
  })
  return Buffer.from(signer.getSignedXml()).toString('base64')
}

export const memoryConnectionStore = (
  initial: Record<string, SsoConnectionConfig> = {},
): SsoConnectionStore & { rows: Map<string, SsoConnectionConfig> } => {
  const rows = new Map(Object.entries(initial))
  return {
    rows,
    get: async (id) => rows.get(id) ?? null,
    save: async (id, config) => {
      rows.set(id, config)
    },
    remove: async (id) => {
      rows.delete(id)
    },
  }
}

export const memoryRequestCache = (): SsoRequestCache & {
  entries: Map<string, string>
} => {
  const entries = new Map<string, string>()
  return {
    entries,
    save: async (key, value) => {
      entries.set(key, value)
    },
    get: async (key) => entries.get(key) ?? null,
    take: async (key) => {
      const value = entries.get(key) ?? null
      entries.delete(key)
      return value
    },
  }
}
