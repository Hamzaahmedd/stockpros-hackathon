import { TeamRole } from '@prisma/client'
jest.mock('../database', () => ({
  prisma: {
    teamMember: { findUnique: jest.fn() },
    teamDomain: { findFirst: jest.fn() },
    subscription: { findUnique: jest.fn() },
  },
}))

import { prisma } from '../database'
import {
  isTeamAdminRole,
  emailDomain,
  findRestrictingDomain,
  getActiveMembership,
  resolveFallbackPlan,
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
