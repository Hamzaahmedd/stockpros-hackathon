import { DomainAuthPolicy, LoginMethod, TeamRole } from '@prisma/client'
import { LoginMethodRequiredError } from '../../errors'
jest.mock('../database', () => ({
  prisma: {
    teamMember: { findUnique: jest.fn() },
    teamDomain: { findFirst: jest.fn() },
    subscription: { findUnique: jest.fn() },
  },
}))

import { prisma } from '../database'
import {
  releaseLapsedMembership,
  can,
  effectiveSeatCapacity,
  TeamPermission,
  isTeamAdminRole,
  emailDomain,
  findRestrictingDomain,
  getActiveMembership,
  resolveFallbackPlan,
  assertLoginAllowed,
  findAuthRestriction,
  isLoginAllowedByPolicy,
  nonCompliantSessionWhere,
} from '../team-access'

const db = prisma as unknown as {
  teamMember: { findUnique: jest.Mock }
  teamDomain: { findFirst: jest.Mock }
  subscription: { findUnique: jest.Mock }
}

afterEach(() => jest.resetAllMocks())

describe('getActiveMembership', () => {
  it('returns null when the user has no membership row', async () => {
    db.teamMember.findUnique.mockResolvedValue(null)
    await expect(getActiveMembership('u1')).resolves.toBeNull()
    expect(db.teamMember.findUnique).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      include: { team: { select: { status: true, orgInstructions: true } } },
    })
  })

  it('returns null when the team is cancelled', async () => {
    db.teamMember.findUnique.mockResolvedValue({
      teamId: 't1',
      role: 'MEMBER',
      monthlyCreditLimitPaisa: null,
      team: { status: 'CANCELLED', orgInstructions: null },
    })
    await expect(getActiveMembership('u1')).resolves.toBeNull()
  })

  it('maps an active team membership', async () => {
    db.teamMember.findUnique.mockResolvedValue({
      id: 'ignored',
      teamId: 't1',
      role: 'ADMIN',
      monthlyCreditLimitPaisa: 5000,
      team: { status: 'ACTIVE', orgInstructions: 'Be brief' },
    })
    await expect(getActiveMembership('u1')).resolves.toEqual({
      teamId: 't1',
      role: 'ADMIN',
      monthlyCreditLimitPaisa: 5000,
      orgInstructions: 'Be brief',
    })
  })

  it('uses the supplied transaction client instead of the global one', async () => {
    const tx = { teamMember: { findUnique: jest.fn().mockResolvedValue(null) } }
    await getActiveMembership('u1', tx as never)
    expect(tx.teamMember.findUnique).toHaveBeenCalled()
    expect(db.teamMember.findUnique).not.toHaveBeenCalled()
  })
})

describe('emailDomain', () => {
  it('lowercases the domain part', () => {
    expect(emailDomain('Jane@ACME.Com')).toBe('acme.com')
  })

  it('returns an empty string when there is no domain', () => {
    expect(emailDomain('no-at-sign')).toBe('')
  })
})

describe('findRestrictingDomain', () => {
  it('queries for the lowercased verified restricting domain', async () => {
    const row = { id: 'd1', domain: 'acme.com' }
    db.teamDomain.findFirst.mockResolvedValue(row)
    await expect(findRestrictingDomain('Jane@ACME.com')).resolves.toBe(row)
    expect(db.teamDomain.findFirst).toHaveBeenCalledWith({
      where: {
        domain: 'acme.com',
        isVerified: true,
        restrictOrgCreation: true,
      },
    })
  })

  it('returns null when no domain restricts the email', async () => {
    db.teamDomain.findFirst.mockResolvedValue(null)
    await expect(findRestrictingDomain('a@free.org')).resolves.toBeNull()
  })

  it('returns null without querying when the email has no domain', async () => {
    await expect(findRestrictingDomain('invalid')).resolves.toBeNull()
    expect(db.teamDomain.findFirst).not.toHaveBeenCalled()
  })
})

describe('resolveFallbackPlan', () => {
  it.each([
    ['PRO', 'ACTIVE', 'PRO'],
    ['PRO', 'GRACE', 'PRO'],
    ['PRO', 'EXPIRED', 'FREE'],
    ['TEAM', 'ACTIVE', 'FREE'],
  ])('%s/%s => %s', async (planTier, status, expected) => {
    db.subscription.findUnique.mockResolvedValue({ planTier, status })
    await expect(resolveFallbackPlan('u1')).resolves.toBe(expected)
    expect(db.subscription.findUnique).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    })
  })

  it('returns FREE when there is no subscription', async () => {
    db.subscription.findUnique.mockResolvedValue(null)
    await expect(resolveFallbackPlan('u1')).resolves.toBe('FREE')
  })

  it('uses the supplied transaction client', async () => {
    const tx = {
      subscription: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ planTier: 'PRO', status: 'ACTIVE' }),
      },
    }
    await expect(resolveFallbackPlan('u1', tx as never)).resolves.toBe('PRO')
    expect(db.subscription.findUnique).not.toHaveBeenCalled()
  })
})

describe('isTeamAdminRole', () => {
  it.each([
    [TeamRole.OWNER, true],
    [TeamRole.ADMIN, true],
    [TeamRole.MEMBER, false],
  ])('%s => %s', (role, expected) => {
    expect(isTeamAdminRole(role)).toBe(expected)
  })

  it('rejects anything that is not exactly a known admin role (defensive, e.g. bad data)', () => {
    expect(isTeamAdminRole('owner' as unknown as TeamRole)).toBe(false)
    expect(isTeamAdminRole(undefined as unknown as TeamRole)).toBe(false)
  })
})

describe('can — the role to permission table', () => {
  const OWNER_ONLY = [
    TeamPermission.MEMBERS_CHANGE_ROLE,
    TeamPermission.ADMINS_MANAGE,
    TeamPermission.OWNERSHIP_TRANSFER,
    TeamPermission.TEAM_DELETE,
    TeamPermission.TEAM_EXPORT,
    TeamPermission.SECURITY_MANAGE,
  ]
  const SHARED_WITH_ADMIN = Object.values(TeamPermission).filter(
    (permission) => !OWNER_ONLY.includes(permission),
  )

  it.each(Object.values(TeamPermission))('the owner can %s', (permission) => {
    expect(can(TeamRole.OWNER, permission)).toBe(true)
  })

  it.each(SHARED_WITH_ADMIN)('an admin can %s', (permission) => {
    expect(can(TeamRole.ADMIN, permission)).toBe(true)
  })

  it.each(OWNER_ONLY)('an admin cannot %s (owner only)', (permission) => {
    expect(can(TeamRole.ADMIN, permission)).toBe(false)
  })

  it.each(Object.values(TeamPermission))(
    'a plain member cannot %s',
    (permission) => {
      expect(can(TeamRole.MEMBER, permission)).toBe(false)
    },
  )

  it('grants nothing to a role outside the enum (bad data)', () => {
    expect(
      can('SUPERUSER' as unknown as TeamRole, TeamPermission.MEMBERS_INVITE),
    ).toBe(false)
  })
})

describe('effectiveSeatCapacity', () => {
  it.each([
    [10, null, 10],
    [10, 6, 6],
    [10, 10, 10],
    // A stale schedule above the capacity never raises it.
    [10, 14, 10],
  ])('capacity %i, scheduled %s -> %i', (seatCapacity, scheduled, expected) => {
    expect(
      effectiveSeatCapacity({
        seatCapacity,
        scheduledSeatCapacity: scheduled,
      }),
    ).toBe(expected)
  })
})

describe('releaseLapsedMembership', () => {
  it("deletes the user's seat only when its workspace is not ACTIVE", async () => {
    const client = { teamMember: { deleteMany: jest.fn() } }
    await releaseLapsedMembership(client as never, 'u1')
    expect(client.teamMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', team: { status: { not: 'ACTIVE' } } },
    })
  })
})

describe('isLoginAllowedByPolicy', () => {
  const GOOGLE = { method: LoginMethod.GOOGLE, googleHd: 'fund.com' }

  it('ANY accepts everything, even an unknown method', () => {
    expect(
      isLoginAllowedByPolicy(DomainAuthPolicy.ANY, 'fund.com', {
        method: null,
      }),
    ).toBe(true)
  })

  it('GOOGLE_ONLY accepts Google (with or without Workspace) only', () => {
    const allowed = (evidence: Parameters<typeof isLoginAllowedByPolicy>[2]) =>
      isLoginAllowedByPolicy(DomainAuthPolicy.GOOGLE_ONLY, 'fund.com', evidence)

    expect(allowed({ method: LoginMethod.GOOGLE })).toBe(true)
    expect(allowed(GOOGLE)).toBe(true)
    expect(allowed({ method: LoginMethod.MAGIC_LINK })).toBe(false)
    expect(allowed({ method: null })).toBe(false)
  })

  it('GOOGLE_WORKSPACE needs Google from this domain’s own Workspace (case-insensitive)', () => {
    const allowed = (evidence: Parameters<typeof isLoginAllowedByPolicy>[2]) =>
      isLoginAllowedByPolicy(
        DomainAuthPolicy.GOOGLE_WORKSPACE,
        'fund.com',
        evidence,
      )

    expect(allowed(GOOGLE)).toBe(true)
    expect(allowed({ method: LoginMethod.GOOGLE, googleHd: 'FUND.com' })).toBe(
      true,
    )
    expect(allowed({ method: LoginMethod.GOOGLE, googleHd: 'other.com' })).toBe(
      false,
    )
    expect(allowed({ method: LoginMethod.GOOGLE })).toBe(false)
    expect(
      allowed({ method: LoginMethod.MAGIC_LINK, googleHd: 'fund.com' }),
    ).toBe(false)
  })

  it('SAML_SSO accepts only an SSO login through the domain’s own tenant', () => {
    const allowed = (
      evidence: Parameters<typeof isLoginAllowedByPolicy>[2],
      tenant: string | null = 'tenant-1',
    ) =>
      isLoginAllowedByPolicy(
        DomainAuthPolicy.SAML_SSO,
        'fund.com',
        evidence,
        tenant,
      )

    expect(allowed({ method: LoginMethod.SSO, ssoTenantId: 'tenant-1' })).toBe(
      true,
    )
    expect(allowed({ method: LoginMethod.SSO, ssoTenantId: 'tenant-2' })).toBe(
      false,
    )
    expect(allowed({ method: LoginMethod.SSO })).toBe(false)
    expect(allowed(GOOGLE)).toBe(false)
    expect(allowed({ method: LoginMethod.MAGIC_LINK })).toBe(false)
    // A domain with no tenant on record cannot be satisfied by anything.
    expect(
      allowed({ method: LoginMethod.SSO, ssoTenantId: 'tenant-1' }, null),
    ).toBe(false)
  })
})

describe('findAuthRestriction / assertLoginAllowed', () => {
  it('finds nothing for an email with no domain, without querying', async () => {
    await expect(findAuthRestriction('not-an-email')).resolves.toBeNull()
    expect(db.teamDomain.findFirst).not.toHaveBeenCalled()
  })

  it('lets a login through when nothing restricts the domain', async () => {
    db.teamDomain.findFirst.mockResolvedValue(null)

    await expect(
      assertLoginAllowed('sam@fund.com', LoginMethod.MAGIC_LINK),
    ).resolves.toBeUndefined()
  })

  it.each([
    [DomainAuthPolicy.GOOGLE_ONLY, 'requires signing in with Google'],
    [DomainAuthPolicy.GOOGLE_WORKSPACE, 'Google Workspace account'],
    [DomainAuthPolicy.SAML_SSO, 'single sign-on'],
  ])(
    'refuses a magic link under %s with a clear message',
    async (policy, text) => {
      db.teamDomain.findFirst.mockResolvedValue({
        domain: 'fund.com',
        authPolicy: policy,
      })

      const error = await assertLoginAllowed(
        'sam@fund.com',
        LoginMethod.MAGIC_LINK,
      ).catch((e) => e)

      expect(error).toBeInstanceOf(LoginMethodRequiredError)
      expect(error.statusCode).toBe(403)
      expect(error.code).toBe('LOGIN_METHOD_REQUIRED')
      expect(error.message).toContain(text)
    },
  )

  it('accepts Google from the right Workspace under GOOGLE_WORKSPACE', async () => {
    db.teamDomain.findFirst.mockResolvedValue({
      domain: 'fund.com',
      authPolicy: DomainAuthPolicy.GOOGLE_WORKSPACE,
    })

    await expect(
      assertLoginAllowed('sam@fund.com', LoginMethod.GOOGLE, 'fund.com'),
    ).resolves.toBeUndefined()
  })

  it('accepts an SSO login through the domain’s own tenant under SAML_SSO', async () => {
    db.teamDomain.findFirst.mockResolvedValue({
      domain: 'fund.com',
      authPolicy: DomainAuthPolicy.SAML_SSO,
      ssoTenantId: 'tenant-1',
    })

    await expect(
      assertLoginAllowed(
        'sam@fund.com',
        LoginMethod.SSO,
        undefined,
        'tenant-1',
      ),
    ).resolves.toBeUndefined()
    await expect(
      assertLoginAllowed(
        'sam@fund.com',
        LoginMethod.SSO,
        undefined,
        'other-tenant',
      ),
    ).rejects.toBeInstanceOf(LoginMethodRequiredError)
  })

  it('ignores a stray ANY record rather than refusing', async () => {
    db.teamDomain.findFirst.mockResolvedValue({
      domain: 'fund.com',
      authPolicy: DomainAuthPolicy.ANY,
    })

    await expect(
      assertLoginAllowed('sam@fund.com', LoginMethod.MAGIC_LINK),
    ).resolves.toBeUndefined()
  })
})

describe('nonCompliantSessionWhere', () => {
  it('has nothing to revoke under ANY', () => {
    expect(
      nonCompliantSessionWhere(DomainAuthPolicy.ANY, 'fund.com'),
    ).toBeNull()
  })

  it('GOOGLE_ONLY targets sessions that are not Google, including unknown ones', () => {
    expect(
      nonCompliantSessionWhere(DomainAuthPolicy.GOOGLE_ONLY, 'fund.com'),
    ).toEqual({
      OR: [{ loginMethod: null }, { loginMethod: { not: LoginMethod.GOOGLE } }],
    })
  })

  it('GOOGLE_WORKSPACE also targets Google sessions from another or no Workspace', () => {
    expect(
      nonCompliantSessionWhere(DomainAuthPolicy.GOOGLE_WORKSPACE, 'fund.com'),
    ).toEqual({
      OR: [
        { loginMethod: null },
        { loginMethod: { not: LoginMethod.GOOGLE } },
        { googleHd: null },
        { googleHd: { not: 'fund.com' } },
      ],
    })
  })

  it('SAML_SSO targets every session not created through the domain’s tenant', () => {
    expect(
      nonCompliantSessionWhere(
        DomainAuthPolicy.SAML_SSO,
        'fund.com',
        'tenant-1',
      ),
    ).toEqual({
      OR: [
        { loginMethod: null },
        { loginMethod: { not: LoginMethod.SSO } },
        { ssoTenantId: null },
        { ssoTenantId: { not: 'tenant-1' } },
      ],
    })
  })

  it('SAML_SSO without a tenant matches every session, since none can comply', () => {
    expect(
      nonCompliantSessionWhere(DomainAuthPolicy.SAML_SSO, 'fund.com'),
    ).toEqual({
      OR: [
        { loginMethod: null },
        { loginMethod: { not: LoginMethod.SSO } },
        { ssoTenantId: null },
        { ssoTenantId: { not: '' } },
      ],
    })
  })
})
