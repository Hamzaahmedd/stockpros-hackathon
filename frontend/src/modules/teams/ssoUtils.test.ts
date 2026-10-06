import { DomainAuthPolicy } from '@/modules/auth/types'
import { describe, expect, it } from 'vitest'
import {
  buildSsoInput,
  certificateExpiryState,
  EMPTY_SSO_FORM,
  isSafeIdpUrl,
  isSsoReady,
  MAX_METADATA_FILE_BYTES,
  parseSsoSource,
  readMetadataFile,
  SSO_PROVIDER_PRESETS,
  SSO_SOURCE_LABELS,
  SSO_SOURCES,
  SSO_STATUS_LABELS,
  ssoStatus,
  SsoStatus,
} from './ssoUtils'
import { SsoConfigSource, type SsoConfig } from './types'

const config = (overrides: Partial<SsoConfig> = {}): SsoConfig => ({
  domain: 'fund.com',
  authPolicy: DomainAuthPolicy.ANY,
  enabled: false,
  configured: true,
  spEntityId: 'https://api/x',
  acsUrl: 'https://api/x/acs',
  idpEntityId: 'https://idp.example.com',
  idpSsoUrl: 'https://idp.example.com/sso',
  certificateExpiresAt: null,
  testedAt: null,
  lastLoginAt: null,
  ...overrides,
})

describe('ssoStatus', () => {
  it.each([
    [{ configured: false }, SsoStatus.NOT_CONFIGURED],
    [{}, SsoStatus.NEEDS_TEST],
    [{ testedAt: '2030-01-01T00:00:00Z' }, SsoStatus.READY],
    [{ enabled: true, testedAt: '2030-01-01T00:00:00Z' }, SsoStatus.ENABLED],
    [{ authPolicy: DomainAuthPolicy.SAML_SSO }, SsoStatus.REQUIRED],
  ])('%j is %s', (overrides, expected) => {
    expect(ssoStatus(config(overrides))).toBe(expected)
  })

  it('has a label for every status', () => {
    for (const status of Object.values(SsoStatus)) {
      expect(SSO_STATUS_LABELS[status]).toBeTruthy()
    }
  })
})

describe('isSsoReady', () => {
  it('needs SSO enabled and a passing test', () => {
    expect(isSsoReady(config())).toBe(false)
    expect(isSsoReady(config({ enabled: true }))).toBe(false)
    expect(isSsoReady(config({ testedAt: '2030-01-01T00:00:00Z' }))).toBe(false)
    expect(
      isSsoReady(config({ enabled: true, testedAt: '2030-01-01T00:00:00Z' })),
    ).toBe(true)
  })
})

describe('certificateExpiryState', () => {
  const now = new Date('2030-01-01T00:00:00Z')

  it.each([
    [null, 'NONE'],
    ['2029-12-31T00:00:00Z', 'EXPIRED'],
    ['2030-01-15T00:00:00Z', 'SOON'],
    ['2030-01-31T00:00:00Z', 'SOON'],
    ['2030-03-01T00:00:00Z', 'OK'],
  ])('%s is %s', (expiresAt, expected) => {
    expect(certificateExpiryState(expiresAt, now)).toBe(expected)
  })
})

describe('provider presets', () => {
  it('cover Okta, Entra ID, Ping and Google Workspace with steps', () => {
    expect(SSO_PROVIDER_PRESETS.map((p) => p.id)).toEqual([
      'okta',
      'azure',
      'ping',
      'google',
    ])
    for (const preset of SSO_PROVIDER_PRESETS) {
      expect(preset.steps.length).toBeGreaterThan(2)
    }
  })
})

describe('sources', () => {
  it('labels and parses every source', () => {
    for (const source of SSO_SOURCES) {
      expect(SSO_SOURCE_LABELS[source]).toBeTruthy()
      expect(parseSsoSource(source)).toBe(source)
    }
    expect(parseSsoSource('FTP')).toBeUndefined()
  })
})

describe('buildSsoInput', () => {
  it('needs an https metadata URL', () => {
    const form = { ...EMPTY_SSO_FORM, source: SsoConfigSource.METADATA_URL }

    expect(buildSsoInput(form)).toBeNull()
    expect(
      buildSsoInput({ ...form, metadataUrl: 'http://idp.example.com/md' }),
    ).toBeNull()
    expect(
      buildSsoInput({ ...form, metadataUrl: ' https://idp.example.com/md ' }),
    ).toEqual({
      source: SsoConfigSource.METADATA_URL,
      metadataUrl: 'https://idp.example.com/md',
    })
  })

  it('needs metadata XML to have been loaded', () => {
    const form = { ...EMPTY_SSO_FORM, source: SsoConfigSource.METADATA_XML }

    expect(buildSsoInput({ ...form, metadataXml: '  ' })).toBeNull()
    expect(buildSsoInput({ ...form, metadataXml: '<md/>' })).toEqual({
      source: SsoConfigSource.METADATA_XML,
      metadataXml: '<md/>',
    })
  })

  it('needs every manual field, with an https sign-in URL', () => {
    const manual = {
      ...EMPTY_SSO_FORM,
      source: SsoConfigSource.MANUAL,
      idpEntityId: ' https://idp.example.com ',
      idpSsoUrl: 'https://idp.example.com/sso',
      idpCertificate: ' CERT ',
    }

    expect(buildSsoInput(manual)).toEqual({
      source: SsoConfigSource.MANUAL,
      idpEntityId: 'https://idp.example.com',
      idpSsoUrl: 'https://idp.example.com/sso',
      idpCertificate: 'CERT',
    })
    expect(buildSsoInput({ ...manual, idpEntityId: ' ' })).toBeNull()
    expect(buildSsoInput({ ...manual, idpCertificate: '' })).toBeNull()
    expect(
      buildSsoInput({ ...manual, idpSsoUrl: 'http://idp.example.com/sso' }),
    ).toBeNull()
  })
})

describe('readMetadataFile', () => {
  it('reads a small file', async () => {
    await expect(
      readMetadataFile(new File(['<md/>'], 'metadata.xml')),
    ).resolves.toBe('<md/>')
  })

  it('refuses a file over the cap before reading it', async () => {
    const big = new File(['x'.repeat(MAX_METADATA_FILE_BYTES + 1)], 'big.xml')

    await expect(readMetadataFile(big)).rejects.toThrow('too large')
  })
})

describe('isSafeIdpUrl', () => {
  it('accepts only https', () => {
    expect(isSafeIdpUrl('https://idp.example.com/sso')).toBe(true)
    expect(isSafeIdpUrl('http://idp.example.com/sso')).toBe(false)
    expect(isSafeIdpUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeIdpUrl('')).toBe(false)
  })
})
