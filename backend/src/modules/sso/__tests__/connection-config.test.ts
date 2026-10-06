import {
  certificateExpiry,
  splitCertificates,
  validateConnectionConfig,
} from '../connection-config'
import { SsoConfigurationError } from '../provider'
import { TEST_CERTIFICATE } from './saml-fixtures'

const NOW = new Date('2030-01-01T00:00:00Z')
const VALID = {
  idpEntityId: 'https://idp.example.com/entity',
  idpSsoUrl: 'https://idp.example.com/sso',
  idpCertificate: TEST_CERTIFICATE,
}
const bareBody = TEST_CERTIFICATE.replaceAll(/-----[A-Z ]+-----|\s/g, '')

describe('splitCertificates', () => {
  it('returns each PEM block', () => {
    const two = `${TEST_CERTIFICATE}\n\n${TEST_CERTIFICATE}`

    expect(splitCertificates(two)).toHaveLength(2)
  })

  it('wraps a bare base64 body as one PEM certificate', () => {
    const [pem] = splitCertificates(bareBody)

    expect(pem.startsWith('-----BEGIN CERTIFICATE-----\n')).toBe(true)
    expect(pem.endsWith('\n-----END CERTIFICATE-----')).toBe(true)
  })
})

describe('validateConnectionConfig', () => {
  it('normalises a valid configuration', () => {
    const result = validateConnectionConfig(
      { ...VALID, idpCertificate: bareBody },
      NOW,
    )

    expect(result.idpCertificate).toContain('BEGIN CERTIFICATE')
    expect(result.idpSsoUrl).toBe(VALID.idpSsoUrl)
  })

  it.each([
    ['plain http', { idpSsoUrl: 'http://idp.example.com/sso' }],
    ['a malformed URL', { idpSsoUrl: 'https://' }],
    ['an empty entity id', { idpEntityId: ' ' }],
    ['a certificate that does not parse', { idpCertificate: 'garbage' }],
  ])('rejects %s', (_label, override) => {
    expect(() =>
      validateConnectionConfig({ ...VALID, ...override }, NOW),
    ).toThrow(SsoConfigurationError)
  })

  it('rejects when no certificate is valid at this moment', () => {
    expect(() =>
      validateConnectionConfig(VALID, new Date('2130-01-01T00:00:00Z')),
    ).toThrow('expired or not yet valid')
  })
})

describe('certificateExpiry', () => {
  it('returns the latest expiry among the stored certificates', () => {
    expect(certificateExpiry(TEST_CERTIFICATE)?.getUTCFullYear()).toBe(2126)
  })

  it('returns null when nothing parses', () => {
    expect(certificateExpiry('garbage')).toBeNull()
  })
})
