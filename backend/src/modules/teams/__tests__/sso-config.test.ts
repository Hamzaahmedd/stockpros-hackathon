const mockDb: any = {
  teamDomain: {
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  teamSsoConnection: { update: jest.fn() },
  userSession: { updateMany: jest.fn() },
  $transaction: jest.fn(),
}
const mockProvider = {
  upsertConnection: jest.fn(),
  deleteConnection: jest.fn(),
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock('../../../shared/infrastructure/team-audit', () => ({
  recordTeamAudit: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../service', () => ({ requireMembership: jest.fn() }))
jest.mock('../../sso', () => ({
  ...jest.requireActual('../../sso/types'),
  ...jest.requireActual('../../sso/provider'),
  // Plain functions, so `resetAllMocks` cannot strip their implementations.
  certificateExpiry: () => new Date('2126-01-01'),
  createSsoProvider: () => mockProvider,
  fetchMetadataDocument: jest.fn(),
  parseIdpMetadata: jest.fn(),
  serviceProviderFor: (id: string) => ({
    spEntityId: `https://api/${id}`,
    acsUrl: `https://api/${id}/acs`,
  }),
  startSsoTest: jest.fn(),
}))

import config from '@/config'
import { DomainAuthPolicy, TeamAuditAction } from '@prisma/client'
import { TeamPermission } from '../../../shared/infrastructure/team-access'
import { recordTeamAudit } from '../../../shared/infrastructure/team-audit'
import {
  fetchMetadataDocument,
  parseIdpMetadata,
  SsoConfigSource,
  SsoConfigurationError,
  startSsoTest,
} from '../../sso'
import { requireMembership } from '../service'
import {
  deleteSsoConfig,
  getSsoConfig,
  saveSsoConfig,
  setSsoEnabled,
  startSsoConnectionTest,
} from '../sso-config'

const ACTOR = 'admin-1'
const TEAM = 'team-1'
const DOMAIN = 'fund.com'
const IDP = {
  idpEntityId: 'https://idp.example.com',
  idpSsoUrl: 'https://idp.example.com/sso',
  idpCertificate: 'cert',
}
const CONNECTION = {
  ...IDP,
  testedAt: new Date('2030-01-02'),
  lastLoginAt: null,
}

const domainRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'dom-1',
  teamId: TEAM,
  domain: DOMAIN,
  isVerified: true,
  authPolicy: DomainAuthPolicy.ANY,
  ssoTenantId: 'dom-1',
  samlEnabled: false,
  ssoConnection: CONNECTION,
  ...overrides,
})

const MANUAL = { source: SsoConfigSource.MANUAL as const, ...IDP }

beforeEach(() => {
  jest.resetAllMocks()
  Object.assign(config.features, { enableSso: true })
  mockDb.$transaction.mockImplementation((fn: any) => fn(mockDb))
  ;(requireMembership as jest.Mock).mockResolvedValue({ teamId: TEAM })
  ;(recordTeamAudit as jest.Mock).mockResolvedValue(undefined)
  mockDb.teamDomain.findFirst.mockResolvedValue(domainRecord())
  mockDb.teamDomain.findUniqueOrThrow.mockResolvedValue(domainRecord())
  mockDb.userSession.updateMany.mockResolvedValue({ count: 2 })
})
afterAll(() => Object.assign(config.features, { enableSso: false }))

describe('access', () => {
  it.each([
    ['get', () => getSsoConfig(ACTOR, DOMAIN)],
    ['save', () => saveSsoConfig(ACTOR, DOMAIN, MANUAL)],
    ['delete', () => deleteSsoConfig(ACTOR, DOMAIN)],
    ['enable', () => setSsoEnabled(ACTOR, DOMAIN, true)],
    ['test', () => startSsoConnectionTest(ACTOR, 'sess', DOMAIN)],
  ])('%s is refused while SSO is switched off', async (_name, call) => {
    Object.assign(config.features, { enableSso: false })

    await expect(call()).rejects.toMatchObject({ statusCode: 403 })
    expect(requireMembership).not.toHaveBeenCalled()
  })

  it('requires the SSO_MANAGE permission', async () => {
    await getSsoConfig(ACTOR, DOMAIN)

    expect(requireMembership).toHaveBeenCalledWith(ACTOR, {
      permission: TeamPermission.SSO_MANAGE,
    })
  })

  it('answers 404 for a domain outside the caller’s workspace', async () => {
    mockDb.teamDomain.findFirst.mockResolvedValue(null)

    await expect(getSsoConfig(ACTOR, 'other.com')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(mockDb.teamDomain.findFirst.mock.calls[0][0].where).toEqual({
      teamId: TEAM,
      domain: 'other.com',
    })
  })
})

describe('getSsoConfig', () => {
  it('describes a configured domain and the values for the IdP', async () => {
    const view = await getSsoConfig(ACTOR, DOMAIN)

    expect(view).toEqual({
      domain: DOMAIN,
      authPolicy: DomainAuthPolicy.ANY,
      enabled: false,
      configured: true,
      spEntityId: 'https://api/dom-1',
      acsUrl: 'https://api/dom-1/acs',
      idpEntityId: IDP.idpEntityId,
      idpSsoUrl: IDP.idpSsoUrl,
      certificateExpiresAt: new Date('2126-01-01'),
      testedAt: CONNECTION.testedAt,
      lastLoginAt: null,
    })
  })

  it('still gives the SP values before anything is configured', async () => {
    mockDb.teamDomain.findFirst.mockResolvedValue(
      domainRecord({ ssoConnection: null, ssoTenantId: null }),
    )

    const view = await getSsoConfig(ACTOR, DOMAIN)

    expect(view).toMatchObject({
      configured: false,
      idpEntityId: null,
      certificateExpiresAt: null,
      testedAt: null,
      acsUrl: 'https://api/dom-1/acs',
    })
  })
})

describe('saveSsoConfig', () => {
  it('saves manual settings, switches SSO off and audits the change', async () => {
    mockDb.teamDomain.findFirst.mockResolvedValue(
      domainRecord({ samlEnabled: true }),
    )

    await saveSsoConfig(ACTOR, DOMAIN, MANUAL)

    expect(mockDb.teamDomain.update).toHaveBeenCalledWith({
      where: { id: 'dom-1' },
      data: { ssoTenantId: 'dom-1', samlEnabled: false },
    })
    expect(mockProvider.upsertConnection).toHaveBeenCalledWith('dom-1', IDP, {
      updatedByUserId: ACTOR,
    })
    expect(mockDb.teamSsoConnection.update).toHaveBeenCalledWith({
      where: { domainId: 'dom-1' },
      data: { idpMetadataXml: null },
    })
    expect(recordTeamAudit).toHaveBeenCalledWith(mockDb, {
      teamId: TEAM,
      actorUserId: ACTOR,
      action: TeamAuditAction.SAML_CONFIG_UPDATED,
      metadata: {
        domainId: 'dom-1',
        source: SsoConfigSource.MANUAL,
        disabled: true,
      },
    })
  })

  it('parses uploaded metadata XML and keeps it', async () => {
    ;(parseIdpMetadata as jest.Mock).mockReturnValue(IDP)

    await saveSsoConfig(ACTOR, DOMAIN, {
      source: SsoConfigSource.METADATA_XML,
      metadataXml: '<md/>',
    })

    expect(parseIdpMetadata).toHaveBeenCalledWith('<md/>')
    expect(mockDb.teamSsoConnection.update.mock.calls[0][0].data).toEqual({
      idpMetadataXml: '<md/>',
    })
  })

  it('fetches then parses a metadata URL', async () => {
    ;(fetchMetadataDocument as jest.Mock).mockResolvedValue('<fetched/>')
    ;(parseIdpMetadata as jest.Mock).mockReturnValue(IDP)

    await saveSsoConfig(ACTOR, DOMAIN, {
      source: SsoConfigSource.METADATA_URL,
      metadataUrl: 'https://idp.example.com/md',
    })

    expect(fetchMetadataDocument).toHaveBeenCalledWith(
      'https://idp.example.com/md',
    )
    expect(mockDb.teamSsoConnection.update.mock.calls[0][0].data).toEqual({
      idpMetadataXml: '<fetched/>',
    })
  })

  it('turns bad IdP settings into a 400 the admin can act on', async () => {
    ;(parseIdpMetadata as jest.Mock).mockImplementation(() => {
      throw new SsoConfigurationError('The metadata is not valid XML')
    })

    await expect(
      saveSsoConfig(ACTOR, DOMAIN, {
        source: SsoConfigSource.METADATA_XML,
        metadataXml: 'x',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'The metadata is not valid XML',
    })
    expect(mockDb.$transaction).not.toHaveBeenCalled()
  })

  it('turns a rejection by the provider into a 400', async () => {
    mockProvider.upsertConnection.mockRejectedValue(
      new SsoConfigurationError('The IdP certificate is expired'),
    )

    await expect(saveSsoConfig(ACTOR, DOMAIN, MANUAL)).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('lets unexpected failures through', async () => {
    mockProvider.upsertConnection.mockRejectedValue(new Error('db down'))

    await expect(saveSsoConfig(ACTOR, DOMAIN, MANUAL)).rejects.toThrow(
      'db down',
    )
  })

  it('refuses an unverified domain', async () => {
    mockDb.teamDomain.findFirst.mockResolvedValue(
      domainRecord({ isVerified: false }),
    )

    await expect(saveSsoConfig(ACTOR, DOMAIN, MANUAL)).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('refuses while the domain requires SSO', async () => {
    mockDb.teamDomain.findFirst.mockResolvedValue(
      domainRecord({ authPolicy: DomainAuthPolicy.SAML_SSO }),
    )

    await expect(saveSsoConfig(ACTOR, DOMAIN, MANUAL)).rejects.toMatchObject({
      statusCode: 409,
    })
    expect(mockProvider.upsertConnection).not.toHaveBeenCalled()
  })
})

describe('deleteSsoConfig', () => {
  it('removes the connection and signs out its SSO sessions', async () => {
    await expect(deleteSsoConfig(ACTOR, DOMAIN)).resolves.toEqual({
      revokedSessions: 2,
    })

    expect(mockDb.userSession.updateMany).toHaveBeenCalledWith({
      where: { ssoTenantId: 'dom-1', isRevoked: false },
      data: { isRevoked: true },
    })
    expect(mockProvider.deleteConnection).toHaveBeenCalledWith('dom-1')
    expect(mockDb.teamDomain.update).toHaveBeenCalledWith({
      where: { id: 'dom-1' },
      data: { ssoTenantId: null, samlEnabled: false },
    })
    expect(recordTeamAudit).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        metadata: { domainId: 'dom-1', removed: true, revokedSessions: 2 },
      }),
    )
  })

  it('answers 404 when nothing is configured', async () => {
    mockDb.teamDomain.findFirst.mockResolvedValue(
      domainRecord({ ssoConnection: null }),
    )

    await expect(deleteSsoConfig(ACTOR, DOMAIN)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('refuses while the domain requires SSO', async () => {
    mockDb.teamDomain.findFirst.mockResolvedValue(
      domainRecord({ authPolicy: DomainAuthPolicy.SAML_SSO }),
    )

    await expect(deleteSsoConfig(ACTOR, DOMAIN)).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('revokes nothing for a domain with no tenant id', async () => {
    mockDb.teamDomain.findFirst.mockResolvedValue(
      domainRecord({ ssoTenantId: null }),
    )

    await expect(deleteSsoConfig(ACTOR, DOMAIN)).resolves.toEqual({
      revokedSessions: 0,
    })
    expect(mockDb.userSession.updateMany).not.toHaveBeenCalled()
  })
})

describe('setSsoEnabled', () => {
  it('enables SSO once a test has passed', async () => {
    await setSsoEnabled(ACTOR, DOMAIN, true)

    expect(mockDb.teamDomain.update).toHaveBeenCalledWith({
      where: { id: 'dom-1' },
      data: { samlEnabled: true },
    })
    expect(mockDb.userSession.updateMany).not.toHaveBeenCalled()
    expect(recordTeamAudit).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        action: TeamAuditAction.SAML_ENABLED,
        metadata: { domainId: 'dom-1', revokedSessions: 0 },
      }),
    )
  })

  it('refuses to enable before a test has passed', async () => {
    mockDb.teamDomain.findFirst.mockResolvedValue(
      domainRecord({ ssoConnection: { ...CONNECTION, testedAt: null } }),
    )

    await expect(setSsoEnabled(ACTOR, DOMAIN, true)).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(mockDb.teamDomain.update).not.toHaveBeenCalled()
  })

  it('refuses to enable with nothing configured', async () => {
    mockDb.teamDomain.findFirst.mockResolvedValue(
      domainRecord({ ssoConnection: null }),
    )

    await expect(setSsoEnabled(ACTOR, DOMAIN, true)).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('disables SSO and signs out its sessions', async () => {
    mockDb.teamDomain.findFirst.mockResolvedValue(
      domainRecord({ samlEnabled: true }),
    )

    await setSsoEnabled(ACTOR, DOMAIN, false)

    expect(mockDb.teamDomain.update).toHaveBeenCalledWith({
      where: { id: 'dom-1' },
      data: { samlEnabled: false },
    })
    expect(recordTeamAudit).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        action: TeamAuditAction.SAML_DISABLED,
        metadata: { domainId: 'dom-1', revokedSessions: 2 },
      }),
    )
  })

  it('refuses to disable while the domain requires SSO', async () => {
    mockDb.teamDomain.findFirst.mockResolvedValue(
      domainRecord({
        samlEnabled: true,
        authPolicy: DomainAuthPolicy.SAML_SSO,
      }),
    )

    await expect(setSsoEnabled(ACTOR, DOMAIN, false)).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe('startSsoConnectionTest', () => {
  it('starts a test for the actor and their session', async () => {
    ;(startSsoTest as jest.Mock).mockResolvedValue({
      redirectUrl: 'https://idp.example.com/sso',
    })

    await expect(
      startSsoConnectionTest(ACTOR, 'sess-1', DOMAIN),
    ).resolves.toEqual({ redirectUrl: 'https://idp.example.com/sso' })
    expect(startSsoTest).toHaveBeenCalledWith({
      tenantId: 'dom-1',
      actorUserId: ACTOR,
      actorSessionId: 'sess-1',
    })
  })

  it.each([
    ['not configured', { ssoConnection: null }],
    ['not verified', { isVerified: false }],
    ['without a tenant', { ssoTenantId: null }],
  ])('refuses a domain that is %s', async (_label, override) => {
    mockDb.teamDomain.findFirst.mockResolvedValue(domainRecord(override))

    await expect(
      startSsoConnectionTest(ACTOR, 'sess-1', DOMAIN),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(startSsoTest).not.toHaveBeenCalled()
  })
})
