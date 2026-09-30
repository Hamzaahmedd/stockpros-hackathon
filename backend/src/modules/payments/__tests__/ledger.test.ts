jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    user: { findUniqueOrThrow: jest.fn(), findMany: jest.fn() },
    team: { findUniqueOrThrow: jest.fn() },
    creditLedger: { findMany: jest.fn() },
  },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  // keep the real, pure role check; only the DB-backed lookups are faked
  isTeamAdminRole: jest.requireActual(
    '../../../shared/infrastructure/team-access',
  ).isTeamAdminRole,
  getActiveMembership: jest.fn(),
}))

import { TeamRole } from '@prisma/client'
import { prisma } from '../../../shared/infrastructure/database'
import { getActiveMembership } from '../../../shared/infrastructure/team-access'
import { SubscriptionScope } from '../constants'
import { getCreditLedger } from '../ledger'

const db = prisma as any

const row = (n: number, overrides: Record<string, any> = {}) => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
  userId: 'user-1',
  teamId: null,
  amountPaisa: -5_000,
  type: 'OVERAGE_CONSUMPTION',
  description: `Overage #${n}`,
  trackerId: 'internal-tracker',
  createdAt: new Date(`2026-09-${String(30 - n).padStart(2, '0')}T00:00:00Z`),
  ...overrides,
})

beforeEach(() => {
  jest.resetAllMocks()
  db.creditLedger.findMany.mockResolvedValue([])
})

describe('personal scope', () => {
  beforeEach(() =>
    db.user.findUniqueOrThrow.mockResolvedValue({
      creditBalanceInPaisa: 95_000,
    }),
  )

  it("returns the caller's own entries newest-first with their balance", async () => {
    db.creditLedger.findMany.mockResolvedValue([row(1), row(2)])

    const page = await getCreditLedger('user-1', {
      scope: SubscriptionScope.USER,
      limit: 25,
    })

    expect(db.creditLedger.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 26,
    })
    expect(page.balanceInPaisa).toBe(95_000)
    expect(page.scope).toBe('USER')
    expect(page.nextCursor).toBeNull()
    expect(page.entries).toHaveLength(2)
    expect(page.entries[0]).toEqual({
      id: row(1).id,
      amountPaisa: -5_000,
      type: 'OVERAGE_CONSUMPTION',
      description: 'Overage #1',
      createdAt: row(1).createdAt,
      isTeamPool: false,
    })
  })

  it('never exposes internal tracker ids or other users', async () => {
    db.creditLedger.findMany.mockResolvedValue([row(1)])
    const page = await getCreditLedger('user-1', {
      scope: SubscriptionScope.USER,
      limit: 25,
    })
    expect(JSON.stringify(page)).not.toContain('internal-tracker')
    expect(page.entries[0]).not.toHaveProperty('trackerId')
    expect(page.entries[0]).not.toHaveProperty('userId')
    expect(db.user.findMany).not.toHaveBeenCalled() // no name lookups for personal view
  })

  it('flags entries that moved the shared team pool', async () => {
    db.creditLedger.findMany.mockResolvedValue([row(1, { teamId: 'team-1' })])
    const page = await getCreditLedger('user-1', {
      scope: SubscriptionScope.USER,
      limit: 25,
    })
    expect(page.entries[0].isTeamPool).toBe(true)
  })
})

describe('pagination', () => {
  beforeEach(() =>
    db.user.findUniqueOrThrow.mockResolvedValue({ creditBalanceInPaisa: 0 }),
  )

  it('trims the probe row and returns the last id as the next cursor', async () => {
    // limit 2 -> service asks for 3; a 3rd row means another page exists.
    db.creditLedger.findMany.mockResolvedValue([row(1), row(2), row(3)])

    const page = await getCreditLedger('user-1', {
      scope: SubscriptionScope.USER,
      limit: 2,
    })

    expect(db.creditLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    )
    expect(page.entries.map((e) => e.description)).toEqual([
      'Overage #1',
      'Overage #2',
    ])
    expect(page.nextCursor).toBe(row(2).id)
  })

  it('reports no next cursor when the page is exactly full but nothing follows', async () => {
    db.creditLedger.findMany.mockResolvedValue([row(1), row(2)])
    const page = await getCreditLedger('user-1', {
      scope: SubscriptionScope.USER,
      limit: 2,
    })
    expect(page.nextCursor).toBeNull()
  })

  it('continues after the cursor, skipping the cursor row itself', async () => {
    await getCreditLedger('user-1', {
      scope: SubscriptionScope.USER,
      limit: 10,
      cursor: row(2).id,
    })
    expect(db.creditLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: row(2).id }, skip: 1 }),
    )
  })
})

describe('workspace scope', () => {
  const member = (role: TeamRole) =>
    (getActiveMembership as jest.Mock).mockResolvedValue({
      teamId: 'team-1',
      role,
    })

  beforeEach(() => {
    db.team.findUniqueOrThrow.mockResolvedValue({
      creditBalanceInPaisa: 250_000,
    })
    db.user.findMany.mockResolvedValue([
      { id: 'user-1', displayName: 'Olivia' },
      { id: 'user-2', displayName: 'Max' },
    ])
  })

  it.each([TeamRole.OWNER, TeamRole.ADMIN])(
    'lets a %s see the whole pool with member names and the pool balance',
    async (role) => {
      member(role)
      db.creditLedger.findMany.mockResolvedValue([
        row(1, { userId: 'user-2', teamId: 'team-1' }),
        row(2, {
          userId: 'user-1',
          teamId: 'team-1',
          amountPaisa: 100_000,
          type: 'PURCHASE',
        }),
        row(3, { userId: null, teamId: 'team-1' }),
      ])

      const page = await getCreditLedger('user-1', {
        scope: SubscriptionScope.TEAM,
        limit: 25,
      })

      expect(db.creditLedger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { teamId: 'team-1' } }),
      )
      expect(page.balanceInPaisa).toBe(250_000)
      expect(page.entries.map((e) => e.memberName)).toEqual([
        'Max',
        'Olivia',
        undefined,
      ])
      // Names are fetched once for the distinct ids, not per row.
      expect(db.user.findMany).toHaveBeenCalledTimes(1)
      expect(db.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['user-2', 'user-1'] } },
        select: { id: true, displayName: true },
      })
    },
  )

  it('forbids plain members from the workspace-wide view', async () => {
    member(TeamRole.MEMBER)
    await expect(
      getCreditLedger('user-1', { scope: SubscriptionScope.TEAM, limit: 25 }),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(db.creditLedger.findMany).not.toHaveBeenCalled()
  })

  it('404s when the caller has no active workspace', async () => {
    ;(getActiveMembership as jest.Mock).mockResolvedValue(null)
    await expect(
      getCreditLedger('user-1', { scope: SubscriptionScope.TEAM, limit: 25 }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
