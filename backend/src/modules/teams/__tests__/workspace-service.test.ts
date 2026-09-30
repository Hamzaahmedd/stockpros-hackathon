const mockPrisma: any = {
  sharedWatchlist: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  sharedScreener: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  sharedResearchNote: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  decisionResult: { findMany: jest.fn() },
  usageEvent: { groupBy: jest.fn() },
  teamMember: { findMany: jest.fn() },
  watchlist: { findMany: jest.fn() },
  creditLedger: { groupBy: jest.fn() },
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

jest.mock('../service', () => ({
  requireMembership: jest.fn(),
}))

jest.mock('../../payments/public', () => ({
  SEARCH_USAGE_FEATURE: 'search',
  recordUsage: jest.fn(),
  resolveUsageWindowStart: jest.fn(),
}))

import { CreditLedgerType, TeamRole } from '@prisma/client'
import { ForbiddenError, NotFoundError } from '../../../shared/errors'
import { recordUsage, resolveUsageWindowStart } from '../../payments/public'
import { SEARCH_RESULT_LIMIT, TOP_SYMBOLS_LIMIT } from '../constants'
import { requireMembership } from '../service'
import * as ws from '../workspace-service'

const membership = (role: TeamRole = TeamRole.MEMBER) => ({
  teamId: 'team-1',
  role,
  monthlyCreditLimitPaisa: null,
  orgInstructions: null,
})
const setRole = (role: TeamRole) =>
  (requireMembership as jest.Mock).mockResolvedValue(membership(role))

beforeEach(() => {
  jest.resetAllMocks()
  setRole(TeamRole.MEMBER)
})

describe('shared watchlists', () => {
  it('lists the team watchlists newest first', async () => {
    mockPrisma.sharedWatchlist.findMany.mockResolvedValue([{ id: 'w1' }])
    await expect(ws.listSharedWatchlists('u1')).resolves.toEqual([{ id: 'w1' }])
    expect(mockPrisma.sharedWatchlist.findMany).toHaveBeenCalledWith({
      where: { teamId: 'team-1' },
      orderBy: { createdAt: 'desc' },
    })
  })

  it('creates with de-duplicated symbols and the creator id', async () => {
    mockPrisma.sharedWatchlist.create.mockResolvedValue({ id: 'w1' })
    await ws.createSharedWatchlist('u1', {
      name: 'Tech',
      symbols: ['AAPL', 'MSFT', 'AAPL'],
    })
    expect(mockPrisma.sharedWatchlist.create).toHaveBeenCalledWith({
      data: {
        teamId: 'team-1',
        name: 'Tech',
        symbols: ['AAPL', 'MSFT'],
        createdBy: 'u1',
      },
    })
  })

  it('throws NotFound when the watchlist is not in the team', async () => {
    mockPrisma.sharedWatchlist.findFirst.mockResolvedValue(null)
    await expect(ws.deleteSharedWatchlist('u1', 'w1')).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(mockPrisma.sharedWatchlist.findFirst).toHaveBeenCalledWith({
      where: { id: 'w1', teamId: 'team-1' },
    })
  })

  it('lets the creator delete', async () => {
    mockPrisma.sharedWatchlist.findFirst.mockResolvedValue({ createdBy: 'u1' })
    await ws.deleteSharedWatchlist('u1', 'w1')
    expect(mockPrisma.sharedWatchlist.delete).toHaveBeenCalledWith({
      where: { id: 'w1' },
    })
  })

  it.each([TeamRole.OWNER, TeamRole.ADMIN])(
    'lets a %s delete someone elses watchlist',
    async (role) => {
      setRole(role)
      mockPrisma.sharedWatchlist.findFirst.mockResolvedValue({
        createdBy: 'other',
      })
      await ws.deleteSharedWatchlist('u1', 'w1')
      expect(mockPrisma.sharedWatchlist.delete).toHaveBeenCalled()
    },
  )

  it('forbids a plain member deleting someone elses watchlist', async () => {
    mockPrisma.sharedWatchlist.findFirst.mockResolvedValue({
      createdBy: 'other',
    })
    await expect(ws.deleteSharedWatchlist('u1', 'w1')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(mockPrisma.sharedWatchlist.delete).not.toHaveBeenCalled()
  })
})

describe('shared screeners', () => {
  it('lists the team screeners', async () => {
    mockPrisma.sharedScreener.findMany.mockResolvedValue([{ id: 's1' }])
    await expect(ws.listSharedScreeners('u1')).resolves.toEqual([{ id: 's1' }])
    expect(mockPrisma.sharedScreener.findMany).toHaveBeenCalledWith({
      where: { teamId: 'team-1' },
      orderBy: { createdAt: 'desc' },
    })
  })

  it('creates a screener owned by the caller', async () => {
    mockPrisma.sharedScreener.create.mockResolvedValue({ id: 's1' })
    await ws.createSharedScreener('u1', { name: 'PE', criteria: { pe: 10 } })
    expect(mockPrisma.sharedScreener.create).toHaveBeenCalledWith({
      data: {
        teamId: 'team-1',
        name: 'PE',
        criteria: { pe: 10 },
        createdBy: 'u1',
      },
    })
  })

  it('throws NotFound for an unknown screener', async () => {
    mockPrisma.sharedScreener.findFirst.mockResolvedValue(null)
    await expect(ws.deleteSharedScreener('u1', 's1')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('lets the creator delete', async () => {
    mockPrisma.sharedScreener.findFirst.mockResolvedValue({ createdBy: 'u1' })
    await ws.deleteSharedScreener('u1', 's1')
    expect(mockPrisma.sharedScreener.delete).toHaveBeenCalledWith({
      where: { id: 's1' },
    })
  })

  it('lets an admin delete others screeners', async () => {
    setRole(TeamRole.ADMIN)
    mockPrisma.sharedScreener.findFirst.mockResolvedValue({ createdBy: 'o' })
    await ws.deleteSharedScreener('u1', 's1')
    expect(mockPrisma.sharedScreener.delete).toHaveBeenCalled()
  })

  it('forbids a plain member deleting others screeners', async () => {
    mockPrisma.sharedScreener.findFirst.mockResolvedValue({ createdBy: 'o' })
    await expect(ws.deleteSharedScreener('u1', 's1')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(mockPrisma.sharedScreener.delete).not.toHaveBeenCalled()
  })
})

describe('research notes', () => {
  it('lists notes for the team, capped at 100', async () => {
    mockPrisma.sharedResearchNote.findMany.mockResolvedValue([])
    await ws.listResearchNotes('u1')
    expect(mockPrisma.sharedResearchNote.findMany).toHaveBeenCalledWith({
      where: { teamId: 'team-1' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  })

  it('filters by upper-cased symbol when provided', async () => {
    mockPrisma.sharedResearchNote.findMany.mockResolvedValue([])
    await ws.listResearchNotes('u1', 'aapl')
    expect(
      mockPrisma.sharedResearchNote.findMany.mock.calls[0][0].where,
    ).toEqual({ teamId: 'team-1', symbol: 'AAPL' })
  })

  it('creates a note authored by the caller', async () => {
    mockPrisma.sharedResearchNote.create.mockResolvedValue({ id: 'n1' })
    await ws.createResearchNote('u1', { symbol: 'AAPL', content: 'Buy' })
    expect(mockPrisma.sharedResearchNote.create).toHaveBeenCalledWith({
      data: {
        teamId: 'team-1',
        symbol: 'AAPL',
        content: 'Buy',
        authorId: 'u1',
      },
    })
  })

  it('throws NotFound for an unknown note', async () => {
    mockPrisma.sharedResearchNote.findFirst.mockResolvedValue(null)
    await expect(ws.deleteResearchNote('u1', 'n1')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('lets the author delete', async () => {
    mockPrisma.sharedResearchNote.findFirst.mockResolvedValue({
      authorId: 'u1',
    })
    await ws.deleteResearchNote('u1', 'n1')
    expect(mockPrisma.sharedResearchNote.delete).toHaveBeenCalledWith({
      where: { id: 'n1' },
    })
  })

  it('lets the owner delete others notes', async () => {
    setRole(TeamRole.OWNER)
    mockPrisma.sharedResearchNote.findFirst.mockResolvedValue({
      authorId: 'o',
    })
    await ws.deleteResearchNote('u1', 'n1')
    expect(mockPrisma.sharedResearchNote.delete).toHaveBeenCalled()
  })

  it('forbids a plain member deleting others notes', async () => {
    mockPrisma.sharedResearchNote.findFirst.mockResolvedValue({
      authorId: 'o',
    })
    await expect(ws.deleteResearchNote('u1', 'n1')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(mockPrisma.sharedResearchNote.delete).not.toHaveBeenCalled()
  })
})

describe('searchWorkspace', () => {
  it('searches all asset types, records unmetered usage, and returns results', async () => {
    const m = membership()
    ;(requireMembership as jest.Mock).mockResolvedValue(m)
    mockPrisma.sharedWatchlist.findMany.mockResolvedValue([{ id: 'w' }])
    mockPrisma.sharedScreener.findMany.mockResolvedValue([{ id: 's' }])
    mockPrisma.sharedResearchNote.findMany.mockResolvedValue([{ id: 'n' }])
    mockPrisma.decisionResult.findMany.mockResolvedValue([{ id: 'd' }])

    const out = await ws.searchWorkspace('u1', 'aapl')

    expect(out).toEqual({
      watchlists: [{ id: 'w' }],
      screeners: [{ id: 's' }],
      notes: [{ id: 'n' }],
      forecasts: [{ id: 'd' }],
    })
    const contains = { contains: 'aapl', mode: 'insensitive' }
    expect(mockPrisma.sharedWatchlist.findMany).toHaveBeenCalledWith({
      where: {
        teamId: 'team-1',
        OR: [{ name: contains }, { symbols: { has: 'AAPL' } }],
      },
      take: SEARCH_RESULT_LIMIT,
    })
    expect(mockPrisma.sharedScreener.findMany).toHaveBeenCalledWith({
      where: { teamId: 'team-1', name: contains },
      take: SEARCH_RESULT_LIMIT,
    })
    expect(
      mockPrisma.sharedResearchNote.findMany.mock.calls[0][0].where,
    ).toEqual({
      teamId: 'team-1',
      OR: [{ content: contains }, { symbol: 'AAPL' }],
    })
    expect(mockPrisma.decisionResult.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        symbol: 'AAPL',
        run: { user: { teamMembers: { some: { teamId: 'team-1' } } } },
      },
      take: SEARCH_RESULT_LIMIT,
    })
    expect(recordUsage).toHaveBeenCalledWith(
      { userId: 'u1', membership: m },
      'search',
      'aapl',
    )
  })

  it('does not swallow membership failures', async () => {
    ;(requireMembership as jest.Mock).mockRejectedValue(
      new NotFoundError('no team'),
    )
    await expect(ws.searchWorkspace('u1', 'aa')).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(recordUsage).not.toHaveBeenCalled()
  })
})

describe('getTeamAnalytics', () => {
  const windowStart = new Date('2026-09-01T00:00:00Z')

  it('requires admin access', async () => {
    ;(requireMembership as jest.Mock).mockRejectedValue(
      new ForbiddenError('admin only'),
    )
    await expect(ws.getTeamAnalytics('u1')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(requireMembership).toHaveBeenCalledWith('u1', { admin: true })
  })

  it('aggregates usage, credit spend, top symbols and tracked tickers', async () => {
    const m = membership(TeamRole.ADMIN)
    ;(requireMembership as jest.Mock).mockResolvedValue(m)
    ;(resolveUsageWindowStart as jest.Mock).mockResolvedValue(windowStart)
    mockPrisma.usageEvent.groupBy
      .mockResolvedValueOnce([
        { userId: 'u1', feature: 'search', _count: { _all: 3 } },
        { userId: 'u1', feature: 'forecast', _count: { _all: 1 } },
        { userId: 'u2', feature: 'search', _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        { symbol: 'AAPL', _count: { _all: 4 } },
        { symbol: 'MSFT', _count: { _all: 1 } },
      ])
    mockPrisma.teamMember.findMany.mockResolvedValue([
      {
        userId: 'u1',
        role: TeamRole.OWNER,
        monthlyCreditLimitPaisa: 1000,
        user: { displayName: 'Ann' },
      },
      {
        userId: 'u2',
        role: TeamRole.MEMBER,
        monthlyCreditLimitPaisa: null,
        user: { displayName: 'Bob' },
      },
      {
        userId: 'u3',
        role: TeamRole.MEMBER,
        monthlyCreditLimitPaisa: null,
        user: { displayName: 'Cy' },
      },
    ])
    mockPrisma.watchlist.findMany.mockResolvedValue([
      { symbol: 'AAPL' },
      { symbol: 'TSLA' },
    ])
    mockPrisma.creditLedger.groupBy.mockResolvedValue([
      { userId: 'u1', _sum: { amountPaisa: -250 } },
      { userId: 'u2', _sum: { amountPaisa: null } },
    ])

    const out = await ws.getTeamAnalytics('u1')

    expect(resolveUsageWindowStart).toHaveBeenCalledWith({
      userId: 'u1',
      membership: m,
    })
    expect(out.windowStart).toBe(windowStart)
    expect(out.totalsByFeature).toEqual({ search: 5, forecast: 1 })
    // `-(x ?? 0)` yields -0 for members without spend; `+ 0` normalises it.
    expect(
      out.perMember.map((m) => ({
        ...m,
        creditSpentPaisa: m.creditSpentPaisa + 0,
      })),
    ).toEqual([
      {
        userId: 'u1',
        displayName: 'Ann',
        role: TeamRole.OWNER,
        usageByFeature: { search: 3, forecast: 1 },
        creditSpentPaisa: 250,
        monthlyCreditLimitPaisa: 1000,
      },
      {
        userId: 'u2',
        displayName: 'Bob',
        role: TeamRole.MEMBER,
        usageByFeature: { search: 2 },
        creditSpentPaisa: 0,
        monthlyCreditLimitPaisa: null,
      },
      {
        userId: 'u3',
        displayName: 'Cy',
        role: TeamRole.MEMBER,
        usageByFeature: {},
        creditSpentPaisa: 0,
        monthlyCreditLimitPaisa: null,
      },
    ])
    expect(out.topSymbols).toEqual([
      { symbol: 'AAPL', count: 4 },
      { symbol: 'MSFT', count: 1 },
    ])
    expect(out.activeTickers).toEqual(['AAPL', 'TSLA'])

    const symbolQuery = mockPrisma.usageEvent.groupBy.mock.calls[1][0]
    expect(symbolQuery.take).toBe(TOP_SYMBOLS_LIMIT)
    expect(symbolQuery.where.symbol).toEqual({ not: null })
    expect(mockPrisma.watchlist.findMany.mock.calls[0][0].where).toEqual({
      userId: { in: ['u1', 'u2', 'u3'] },
    })
    expect(mockPrisma.creditLedger.groupBy.mock.calls[0][0].where).toEqual({
      teamId: 'team-1',
      type: CreditLedgerType.OVERAGE_CONSUMPTION,
      createdAt: { gte: windowStart },
    })
  })
})
