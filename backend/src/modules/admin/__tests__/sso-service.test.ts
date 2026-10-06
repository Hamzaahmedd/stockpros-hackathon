/**
 * Staff SSO tools: the read view, the emergency disable and the reset. Each
 * write must append exactly one AdminAuditLog row and one team audit row for
 * what changed, inside its transaction; a rejected write appends none.
 */
const mockTx: any = {
  teamDomain: { findUnique: jest.fn(), update: jest.fn() },
  teamAuditLog: { create: jest.fn() },
  userSession: { updateMany: jest.fn() },
  adminAuditLog: { create: jest.fn() },
}
const mockPrisma: any = {
  ...mockTx,
  teamDomain: { findUnique: jest.fn() },
  teamAuditLog: { findMany: jest.fn(), create: jest.fn() },
  userSession: { count: jest.fn() },
  adminAuditLog: { create: jest.fn() },
  $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(mockTx)),
}
const mockProvider = { deleteConnection: jest.fn() }

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))
jest.mock('../../sso', () => ({
  // Plain functions, so `resetAllMocks` cannot strip their implementations.
  certificateExpiry: () => new Date('2126-01-01T00:00:00.000Z'),
  createSsoProvider: () => mockProvider,
}))

import {
  AdminAuditAction,
  DomainAuthPolicy,
  TeamAuditAction,
} from '@prisma/client'
import { ConflictError, NotFoundError } from '../../../shared/errors'
import { disableSso, getTeamSso, resetSso } from '../sso-service'

const ADMIN = '0191e4a0-0000-7000-8000-0000000000aa'
const TEAM = 'team-1'
const ctx = {
  adminId: ADMIN,
  reason: 'IdP certificate expired, customer locked out',
  ticketRef: 'SUP-4821',
  ipAddress: '10.0.0.7',
}
const readCtx = { adminId: ADMIN, ipAddress: ctx.ipAddress }

const CONNECTION = {
  idpEntityId: 'https://idp.example.com',
  idpSsoUrl: 'https://idp.example.com/sso',
  idpCertificate: 'CERT-PEM-NEVER-RETURNED',
  testedAt: new Date('2030-01-02'),
  lastLoginAt: new Date('2030-01-03'),
  updatedByUserId: 'admin-1',
}

const domainRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'dom-1',
  teamId: TEAM,
  domain: 'fund.com',
  authPolicy: DomainAuthPolicy.ANY,
  ssoTenantId: 'dom-1',
  samlEnabled: true,
  ssoConnection: CONNECTION,
  ...overrides,
})

const teamAudits = () =>
  mockTx.teamAuditLog.create.mock.calls.map((call: any) => call[0].data)

beforeEach(() => {
  jest.resetAllMocks()
  mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockTx))
  mockTx.userSession.updateMany.mockResolvedValue({ count: 3 })
})

describe('getTeamSso', () => {
  it('describes the setup, live sessions and recent trail, without the certificate', async () => {
    mockPrisma.teamDomain.findUnique.mockResolvedValue(domainRecord())
    mockPrisma.userSession.count.mockResolvedValue(7)
    const activity = [
      {
        id: 'a1',
        action: TeamAuditAction.SAML_ENABLED,
        actorUserId: 'admin-1',
        metadata: { domainId: 'dom-1' },
        createdAt: new Date('2030-01-04'),
      },
    ]
    mockPrisma.teamAuditLog.findMany.mockResolvedValue(activity)

    const view = await getTeamSso(readCtx, 'fund.com')

    expect(view).toEqual({
      domain: 'fund.com',
      domainId: 'dom-1',
      teamId: TEAM,
      authPolicy: DomainAuthPolicy.ANY,
      enabled: true,
      configured: true,
      idpEntityId: CONNECTION.idpEntityId,
      idpSsoUrl: CONNECTION.idpSsoUrl,
      certificateExpiresAt: new Date('2126-01-01T00:00:00.000Z'),
      testedAt: CONNECTION.testedAt,
      lastLoginAt: CONNECTION.lastLoginAt,
      updatedByUserId: 'admin-1',
      activeSsoSessions: 7,
      recentActivity: activity,
    })
    expect(JSON.stringify(view)).not.toContain('CERT-PEM')
    expect(mockPrisma.teamAuditLog.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        teamId: TEAM,
        action: {
          in: [
            TeamAuditAction.SAML_CONFIG_UPDATED,
            TeamAuditAction.SAML_ENABLED,
            TeamAuditAction.SAML_DISABLED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
  })

  it('audits the read, naming the domain id and never the search', async () => {
    mockPrisma.teamDomain.findUnique.mockResolvedValue(domainRecord())
    mockPrisma.userSession.count.mockResolvedValue(0)
    mockPrisma.teamAuditLog.findMany.mockResolvedValue([])

    await getTeamSso(readCtx, 'fund.com')

    const { data } = mockPrisma.adminAuditLog.create.mock.calls[0][0]
    expect(data).toMatchObject({
      adminId: ADMIN,
      action: AdminAuditAction.CUSTOMER_DATA_VIEWED,
      targetType: 'TEAM_DOMAIN',
    })
    expect(data.metadata.resultIds).toEqual(['dom-1'])
  })

  it('reports a domain with no SSO and does not count sessions', async () => {
    mockPrisma.teamDomain.findUnique.mockResolvedValue(
      domainRecord({
        ssoConnection: null,
        ssoTenantId: null,
        samlEnabled: false,
      }),
    )
    mockPrisma.teamAuditLog.findMany.mockResolvedValue([])

    const view = await getTeamSso(readCtx, 'fund.com')

    expect(view).toMatchObject({
      configured: false,
      enabled: false,
      idpEntityId: null,
      certificateExpiresAt: null,
      testedAt: null,
      activeSsoSessions: 0,
    })
    expect(mockPrisma.userSession.count).not.toHaveBeenCalled()
  })

  it('answers 404 for an unknown domain, without an audit row', async () => {
    mockPrisma.teamDomain.findUnique.mockResolvedValue(null)

    await expect(getTeamSso(readCtx, 'nope.com')).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(mockPrisma.adminAuditLog.create).not.toHaveBeenCalled()
  })
})

describe('disableSso', () => {
  it('turns SSO off, signs out its sessions and audits both trails', async () => {
    mockTx.teamDomain.findUnique.mockResolvedValue(domainRecord())

    const result = await disableSso(ctx, 'fund.com')

    expect(result).toEqual({
      domain: 'fund.com',
      teamId: TEAM,
      enabled: false,
      authPolicy: DomainAuthPolicy.ANY,
      revokedSessions: 3,
    })
    expect(mockTx.teamDomain.update).toHaveBeenCalledWith({
      where: { id: 'dom-1' },
      data: { samlEnabled: false },
    })
    expect(mockTx.userSession.updateMany).toHaveBeenCalledWith({
      where: { ssoTenantId: 'dom-1', isRevoked: false },
      data: { isRevoked: true },
    })
    expect(teamAudits()).toEqual([
      expect.objectContaining({
        teamId: TEAM,
        actorUserId: ADMIN,
        action: TeamAuditAction.SAML_DISABLED,
        metadata: { domainId: 'dom-1', revokedSessions: 3, byStaff: true },
      }),
    ])
    expect(mockTx.adminAuditLog.create).toHaveBeenCalledTimes(1)
    expect(mockTx.adminAuditLog.create.mock.calls[0][0].data).toMatchObject({
      adminId: ADMIN,
      action: AdminAuditAction.SAML_DISABLED,
      targetType: 'TEAM_DOMAIN',
      targetId: 'dom-1',
      reason: ctx.reason,
      ticketRef: 'SUP-4821',
      ipAddress: ctx.ipAddress,
      metadata: expect.objectContaining({ revokedSessions: 3 }),
    })
  })

  it('frees a domain that required SSO by putting it back to any method', async () => {
    mockTx.teamDomain.findUnique.mockResolvedValue(
      domainRecord({ authPolicy: DomainAuthPolicy.SAML_SSO }),
    )

    const result = await disableSso(ctx, 'fund.com')

    expect(result.authPolicy).toBe(DomainAuthPolicy.ANY)
    expect(mockTx.teamDomain.update).toHaveBeenCalledWith({
      where: { id: 'dom-1' },
      data: { samlEnabled: false, authPolicy: DomainAuthPolicy.ANY },
    })
    expect(teamAudits().map((data: any) => data.action)).toEqual([
      TeamAuditAction.AUTH_POLICY_SET,
      TeamAuditAction.SAML_DISABLED,
    ])
    expect(
      mockTx.adminAuditLog.create.mock.calls[0][0].data.metadata,
    ).toMatchObject({ previousPolicy: DomainAuthPolicy.SAML_SSO })
  })

  it('still frees a required domain whose SSO flag was already off', async () => {
    mockTx.teamDomain.findUnique.mockResolvedValue(
      domainRecord({
        samlEnabled: false,
        authPolicy: DomainAuthPolicy.SAML_SSO,
      }),
    )

    await expect(disableSso(ctx, 'fund.com')).resolves.toMatchObject({
      authPolicy: DomainAuthPolicy.ANY,
    })
  })

  it('revokes nothing for a domain without a tenant', async () => {
    mockTx.teamDomain.findUnique.mockResolvedValue(
      domainRecord({
        ssoTenantId: null,
        authPolicy: DomainAuthPolicy.SAML_SSO,
      }),
    )

    await expect(disableSso(ctx, 'fund.com')).resolves.toMatchObject({
      revokedSessions: 0,
    })
    expect(mockTx.userSession.updateMany).not.toHaveBeenCalled()
  })

  it('rejects an unknown domain or one whose SSO is already off, writing nothing', async () => {
    mockTx.teamDomain.findUnique.mockResolvedValueOnce(null)
    await expect(disableSso(ctx, 'nope.com')).rejects.toBeInstanceOf(
      NotFoundError,
    )

    mockTx.teamDomain.findUnique.mockResolvedValueOnce(
      domainRecord({ samlEnabled: false }),
    )
    await expect(disableSso(ctx, 'fund.com')).rejects.toBeInstanceOf(
      ConflictError,
    )

    expect(mockTx.teamDomain.update).not.toHaveBeenCalled()
    expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled()
    expect(mockTx.teamAuditLog.create).not.toHaveBeenCalled()
  })
})

describe('resetSso', () => {
  it('removes the connection and tenant, signs out SSO sessions and audits both trails', async () => {
    mockTx.teamDomain.findUnique.mockResolvedValue(domainRecord())

    const result = await resetSso(ctx, 'fund.com')

    expect(result).toEqual({
      domain: 'fund.com',
      teamId: TEAM,
      authPolicy: DomainAuthPolicy.ANY,
      revokedSessions: 3,
    })
    expect(mockProvider.deleteConnection).toHaveBeenCalledWith('dom-1')
    expect(mockTx.teamDomain.update).toHaveBeenCalledWith({
      where: { id: 'dom-1' },
      data: { ssoTenantId: null, samlEnabled: false },
    })
    expect(teamAudits()).toEqual([
      expect.objectContaining({
        action: TeamAuditAction.SAML_CONFIG_UPDATED,
        metadata: {
          domainId: 'dom-1',
          removed: true,
          revokedSessions: 3,
          byStaff: true,
        },
      }),
    ])
    expect(mockTx.adminAuditLog.create.mock.calls[0][0].data).toMatchObject({
      adminId: ADMIN,
      action: AdminAuditAction.SAML_CONFIG_RESET,
      targetType: 'TEAM_DOMAIN',
      targetId: 'dom-1',
      reason: ctx.reason,
      ticketRef: 'SUP-4821',
    })
  })

  it('returns a domain that required SSO to any method', async () => {
    mockTx.teamDomain.findUnique.mockResolvedValue(
      domainRecord({ authPolicy: DomainAuthPolicy.SAML_SSO }),
    )

    const result = await resetSso(ctx, 'fund.com')

    expect(result.authPolicy).toBe(DomainAuthPolicy.ANY)
    expect(mockTx.teamDomain.update).toHaveBeenCalledWith({
      where: { id: 'dom-1' },
      data: {
        ssoTenantId: null,
        samlEnabled: false,
        authPolicy: DomainAuthPolicy.ANY,
      },
    })
    expect(teamAudits().map((data: any) => data.action)).toEqual([
      TeamAuditAction.AUTH_POLICY_SET,
      TeamAuditAction.SAML_CONFIG_UPDATED,
    ])
  })

  it('rejects an unknown domain or one with no SSO, writing nothing', async () => {
    mockTx.teamDomain.findUnique.mockResolvedValueOnce(null)
    await expect(resetSso(ctx, 'nope.com')).rejects.toBeInstanceOf(
      NotFoundError,
    )

    mockTx.teamDomain.findUnique.mockResolvedValueOnce(
      domainRecord({ ssoTenantId: null }),
    )
    await expect(resetSso(ctx, 'fund.com')).rejects.toBeInstanceOf(
      ConflictError,
    )

    expect(mockProvider.deleteConnection).not.toHaveBeenCalled()
    expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled()
  })
})
