import { X509Certificate } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import { splitCertificates } from './connection-config'
import { SsoConfigurationError, type SsoConnectionConfig } from './provider'
import { MAX_METADATA_BYTES } from './safe-fetch'

const REDIRECT_BINDING = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'

type XmlNode = Record<string, unknown>

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  // Entities are never expanded; DOCTYPE is refused outright before parsing.
  processEntities: false,
  parseTagValue: false,
})

const asArray = (value: unknown): XmlNode[] => {
  if (Array.isArray(value)) return value as XmlNode[]
  return value && typeof value === 'object' ? [value as XmlNode] : []
}

const text = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim()
    : typeof (value as XmlNode | undefined)?.['#text'] === 'string'
      ? ((value as XmlNode)['#text'] as string).trim()
      : ''

const findIdpDescriptor = (
  root: XmlNode,
): { entityId: string; idp: XmlNode } => {
  const descriptors = asArray(root.EntityDescriptor).length
    ? asArray(root.EntityDescriptor)
    : asArray(
        (root.EntitiesDescriptor as XmlNode | undefined)?.EntityDescriptor,
      )
  for (const descriptor of descriptors) {
    const idp = asArray(descriptor.IDPSSODescriptor)[0]
    const entityId = text(descriptor['@_entityID'])
    if (idp && entityId) return { entityId, idp }
  }
  throw new SsoConfigurationError(
    'The metadata has no identity provider (IDPSSODescriptor)',
  )
}

const signingCertificates = (idp: XmlNode, now: Date): string[] =>
  asArray(idp.KeyDescriptor)
    .filter((key) => !key['@_use'] || key['@_use'] === 'signing')
    .map((key) =>
      text(asArray(asArray(key.KeyInfo)[0]?.X509Data)[0]?.X509Certificate),
    )
    .filter(Boolean)
    .flatMap((body) => splitCertificates(body))
    .filter((pem) => {
      try {
        return new Date(new X509Certificate(pem).validTo) >= now
      } catch {
        return false
      }
    })

/** Reads an IdP's SAML metadata document into the settings we store. */
export const parseIdpMetadata = (
  xml: string,
  now: Date = new Date(),
): SsoConnectionConfig => {
  if (Buffer.byteLength(xml, 'utf8') > MAX_METADATA_BYTES) {
    throw new SsoConfigurationError('The metadata document is too large')
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new SsoConfigurationError('The metadata document is not allowed')
  }

  let root: XmlNode
  try {
    root = parser.parse(xml) as XmlNode
  } catch {
    throw new SsoConfigurationError('The metadata is not valid XML')
  }

  const { entityId, idp } = findIdpDescriptor(root)
  const redirect = asArray(idp.SingleSignOnService).find(
    (service) => service['@_Binding'] === REDIRECT_BINDING,
  )
  const ssoUrl = text(redirect?.['@_Location'])
  if (!ssoUrl) {
    throw new SsoConfigurationError(
      'The metadata has no HTTP-Redirect sign-in endpoint',
    )
  }
  const certificates = signingCertificates(idp, now)
  if (certificates.length === 0) {
    throw new SsoConfigurationError(
      'The metadata has no current signing certificate',
    )
  }
  return {
    idpEntityId: entityId,
    idpSsoUrl: ssoUrl,
    idpCertificate: certificates.join('\n'),
  }
}
