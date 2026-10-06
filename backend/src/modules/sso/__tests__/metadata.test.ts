import { parseIdpMetadata } from '../metadata'
import { SsoConfigurationError } from '../provider'
import { TEST_CERTIFICATE } from './saml-fixtures'

const NOW = new Date('2030-01-01T00:00:00Z')
const BODY = TEST_CERTIFICATE.replaceAll(/-----[A-Z ]+-----|\s/g, '')
const REDIRECT = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'
const POST = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST'

const metadata = (
  parts: {
    entityId?: string
    services?: string
    keys?: string
    idp?: boolean
  } = {},
) => {
  const {
    entityId = 'https://idp.example.com/entity',
    services = `<md:SingleSignOnService Binding="${POST}" Location="https://idp.example.com/post"/><md:SingleSignOnService Binding="${REDIRECT}" Location="https://idp.example.com/sso"/>`,
    keys = `<md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${BODY}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>`,
    idp = true,
  } = parts
  const descriptor = idp
    ? `<md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">${keys}${services}</md:IDPSSODescriptor>`
    : '<md:SPSSODescriptor/>'
  return `<?xml version="1.0"?><md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="${entityId}">${descriptor}</md:EntityDescriptor>`
}

describe('parseIdpMetadata', () => {
  it('reads the entity id, the HTTP-Redirect endpoint and the signing certificate', () => {
    const result = parseIdpMetadata(metadata(), NOW)

    expect(result.idpEntityId).toBe('https://idp.example.com/entity')
    expect(result.idpSsoUrl).toBe('https://idp.example.com/sso')
    expect(result.idpCertificate).toContain('BEGIN CERTIFICATE')
  })

  it('accepts a certificate with no `use` attribute', () => {
    const keys = `<md:KeyDescriptor><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${BODY}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>`

    expect(parseIdpMetadata(metadata({ keys }), NOW).idpCertificate).toContain(
      'CERTIFICATE',
    )
  })

  it('finds the IdP inside an EntitiesDescriptor wrapper', () => {
    const inner = metadata().replace('<?xml version="1.0"?>', '')
    const wrapped = `<md:EntitiesDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">${inner}</md:EntitiesDescriptor>`

    expect(parseIdpMetadata(wrapped, NOW).idpEntityId).toBe(
      'https://idp.example.com/entity',
    )
  })

  it.each([
    ['not xml at all', 'plain text', 'no identity provider'],
    [
      'a service provider descriptor',
      metadata({ idp: false }),
      'no identity provider',
    ],
    [
      'no HTTP-Redirect endpoint',
      metadata({
        services: `<md:SingleSignOnService Binding="${POST}" Location="https://idp.example.com/post"/>`,
      }),
      'HTTP-Redirect',
    ],
    ['no signing certificate', metadata({ keys: '' }), 'signing certificate'],
  ])('rejects %s', (_label, xml, message) => {
    expect(() => parseIdpMetadata(xml, NOW)).toThrow(message)
  })

  it('ignores certificates that have already expired', () => {
    expect(() =>
      parseIdpMetadata(metadata(), new Date('2130-01-01T00:00:00Z')),
    ).toThrow('signing certificate')
  })

  it('refuses a DOCTYPE or entity declaration', () => {
    const hostile = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]>${metadata()}`

    expect(() => parseIdpMetadata(hostile, NOW)).toThrow(SsoConfigurationError)
  })

  it('refuses an oversized document', () => {
    expect(() =>
      parseIdpMetadata(`${metadata()}${' '.repeat(300_000)}`, NOW),
    ).toThrow('too large')
  })
})
