const mockPrisma: any = {
  user: { findUniqueOrThrow: jest.fn() },
  userSession: { findFirst: jest.fn(), updateMany: jest.fn() },
  teamDomain: { findFirst: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

jest.mock('../../../shared/infrastructure/team-audit', () => ({
  recordTeamAudit: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../service', () => ({
  requireMembership: jest.fn(),
}))

import { DomainAuthPolicy, LoginMethod, TeamAuditAction } from '@prisma/client'
import { TeamPermission } from '../../../shared/infrastructure/team-access'
import { recordTeamAudit } from '../../../shared/infrastructure/team-audit'
import { setAuthPolicy } from '../auth-policy'
import { requireMembership } from '../service'

const TEAM = 'team-1'
const OWNER = 'owner-1'
const SESSION = 'session-1'
const DOMAIN = 'fund.com'

const tx = {
  teamDomain: mockPrisma.teamDomain,
  userSession: mockPrisma.userSession,
}

const verifiedDomain = { id: 'dom-1', teamId: TEAM, isVerified: true }

beforeEach(() => {
  jest.resetAllMocks()
  mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))
  ;(requireMembership as jest.Mock).mockResolvedValue({ teamId: TEAM })
  mockPrisma.teamDomain.findFirst.mockResolvedValue(verifiedDomain)
  mockPrisma.teamDomain.update.mockResolvedValue({
    id: 'dom-1',
    domain: DOMAIN,
    authPolicy: DomainAuthPolicy.GOOGLE_ONLY,
  })
  mockPrisma.userSession.updateMany.mockResolvedValue({ count: 3 })
  // The owner is on the domain and signed in with Google by default.
  mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
    email: `owner@${DOMAIN}`,
  })
  mockPrisma.userSession.findFirst.mockResolvedValue({
    loginMethod: LoginMethod.GOOGLE,
    googleHd: DOMAIN,
  })
})

const set = (
  authPolicy: DomainAuthPolicy,
  overrides: { confirmDomain?: string; sessionId?: string } = {},
) =>
  setAuthPolicy(
    OWNER,
    'sessionId' in overrides ? overrides.sessionId : SESSION,
    DOMAIN,
    {
      authPolicy,
      confirmDomain:
        'confirmDomain' in overrides ? overrides.confirmDomain : DOMAIN,
    },
  )

describe('setAuthPolicy', () => {
  it('is owner only (security permission)', async () => {
    await set(DomainAuthPolicy.GOOGLE_ONLY)

    expect(requireMembership).toHaveBeenCalledWith(OWNER, {
      permission: TeamPermission.SECURITY_MANAGE,
    })
  })

  it('answers 404 for a domain outside the owner’s workspace', async () => {
    mockPrisma.teamDomain.findFirst.mockResolvedValue(null)

    await expect(set(DomainAuthPolicy.GOOGLE_ONLY)).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(mockPrisma.teamDomain.findFirst).toHaveBeenCalledWith({
      where: { teamId: TEAM, domain: DOMAIN },
    })
  })

  it('refuses to restrict an unverified domain', async () => {
    mockPrisma.teamDomain.findFirst.mockResolvedValue({
      ...verifiedDomain,
      isVerified: false,
    })

    await expect(set(DomainAuthPolicy.GOOGLE_ONLY)).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(mockPrisma.teamDomain.update).not.toHaveBeenCalled()
  })

  it.each([undefined, 'other.com'])(
    'requires the domain typed back as confirmation (got %s)',
    async (confirmDomain) => {
      await expect(
        set(DomainAuthPolicy.GOOGLE_ONLY, { confirmDomain }),
      ).rejects.toMatchObject({ statusCode: 400 })
      expect(mockPrisma.teamDomain.update).not.toHaveBeenCalled()
    },
  )

  describe('owner lockout safeguard', () => {
    it.each([
      [
        'a magic-link session',
        { loginMethod: LoginMethod.MAGIC_LINK, googleHd: null },
      ],
      [
        'a session from before enforcement',
        { loginMethod: null, googleHd: null },
      ],
    ])(
      'refuses when the owner is on the domain with %s',
      async (_name, row) => {
        mockPrisma.userSession.findFirst.mockResolvedValue(row)

        await expect(set(DomainAuthPolicy.GOOGLE_ONLY)).rejects.toMatchObject({
          statusCode: 409,
        })
        expect(mockPrisma.teamDomain.update).not.toHaveBeenCalled()
        expect(mockPrisma.userSession.updateMany).not.toHaveBeenCalled()
      },
    )

    it('refuses when the request carries no session id', async () => {
      await expect(
        set(DomainAuthPolicy.GOOGLE_ONLY, { sessionId: undefined }),
      ).rejects.toMatchObject({ statusCode: 409 })
      expect(mockPrisma.userSession.findFirst).not.toHaveBeenCalled()
    })

    it('refuses when the session is gone or revoked', async () => {
      mockPrisma.userSession.findFirst.mockResolvedValue(null)

      await expect(set(DomainAuthPolicy.GOOGLE_ONLY)).rejects.toMatchObject({
        statusCode: 409,
      })
      expect(mockPrisma.userSession.findFirst).toHaveBeenCalledWith({
        where: { id: SESSION, userId: OWNER, isRevoked: false },
        select: { loginMethod: true, googleHd: true },
      })
    })

    it('needs a Workspace account for this domain under GOOGLE_WORKSPACE', async () => {
      mockPrisma.userSession.findFirst.mockResolvedValue({
        loginMethod: LoginMethod.GOOGLE,
        googleHd: null,
      })

      await expect(
        set(DomainAuthPolicy.GOOGLE_WORKSPACE),
      ).rejects.toMatchObject({ statusCode: 409 })
    })

    it('does not apply when the owner’s email is on a different domain', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        email: 'owner@elsewhere.com',
      })
      mockPrisma.userSession.findFirst.mockResolvedValue(null)

      await expect(set(DomainAuthPolicy.GOOGLE_ONLY)).resolves.toBeDefined()
      expect(mockPrisma.userSession.findFirst).not.toHaveBeenCalled()
    })
  })

  it('applies the policy, signs out non-compliant sessions on the domain except the owner’s, and audits the count', async () => {
    const result = await set(DomainAuthPolicy.GOOGLE_ONLY)

    expect(mockPrisma.teamDomain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dom-1' },
        data: { authPolicy: DomainAuthPolicy.GOOGLE_ONLY },
      }),
    )
    const { where, data } = mockPrisma.userSession.updateMany.mock.calls[0][0]
    expect(data).toEqual({ isRevoked: true })
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { isRevoked: false },
        { user: { email: { endsWith: `@${DOMAIN}`, mode: 'insensitive' } } },
        { id: { not: SESSION } },
        {
          OR: [
            { loginMethod: null },
            { loginMethod: { not: LoginMethod.GOOGLE } },
          ],
        },
      ]),
    )
    expect(recordTeamAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: TeamAuditAction.AUTH_POLICY_SET,
        actorUserId: OWNER,
        metadata: {
          domainId: 'dom-1',
          authPolicy: DomainAuthPolicy.GOOGLE_ONLY,
          revokedSessions: 3,
        },
      }),
    )
    expect(result).toMatchObject({ revokedSessions: 3 })
  })

  it('also requires matching Workspace domains for GOOGLE_WORKSPACE', async () => {
    await set(DomainAuthPolicy.GOOGLE_WORKSPACE)

    const { where } = mockPrisma.userSession.updateMany.mock.calls[0][0]
    expect(where.AND).toContainEqual({
      OR: expect.arrayContaining([
        { googleHd: null },
        { googleHd: { not: DOMAIN } },
      ]),
    })
  })

  it('moving back to ANY needs no confirmation, no lockout check and revokes nothing', async () => {
    await setAuthPolicy(OWNER, undefined, DOMAIN, {
      authPolicy: DomainAuthPolicy.ANY,
    })

    expect(mockPrisma.user.findUniqueOrThrow).not.toHaveBeenCalled()
    expect(mockPrisma.userSession.updateMany).not.toHaveBeenCalled()
    expect(recordTeamAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        metadata: expect.objectContaining({
          authPolicy: DomainAuthPolicy.ANY,
          revokedSessions: 0,
        }),
      }),
    )
  })

  it('does not exclude any session when the caller has none (owner off the domain)', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      email: 'owner@elsewhere.com',
    })

    await set(DomainAuthPolicy.GOOGLE_ONLY, { sessionId: undefined })

    const { where } = mockPrisma.userSession.updateMany.mock.calls[0][0]
    expect(where.AND.some((clause: object) => 'id' in clause)).toBe(false)
  })
})
