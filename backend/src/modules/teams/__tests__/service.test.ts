const mockPrisma: any = {
  team: {
    create: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  teamMember: {
    count: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  teamAuditLog: { create: jest.fn() },
  teamInvite: {
    count: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    findUnique: jest.fn(),
  },
  teamDomain: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  // keep the real, pure helpers (roles, permissions); only the DB-backed lookups are faked
  ...jest.requireActual('../../../shared/infrastructure/team-access'),
  getActiveMembership: jest.fn(),
  resolveFallbackPlan: jest.fn(),
}))

jest.mock('../../payments/public', () => ({
  TEAM_MAX_SEATS: 150,
  assertCanCreateTeam: jest.fn(),
  createSeatAdditionCheckout: jest.fn(),
  createTeamCheckout: jest.fn(),
}))

jest.mock('../../notifications/public', () => ({
  enqueueTeamInviteEmail: jest.fn(),
}))

jest.mock('../domain-verification', () => ({
  checkDomainTxtRecord: jest.fn(),
  verificationRecordName: (domain: string) => `_rec.${domain}`,
  verificationRecordValue: (token: string) => `val=${token}`,
}))

import config from '@/config'
import { PlanTier, TeamRole } from '@prisma/client'
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/errors'
import {
  getActiveMembership,
  resolveFallbackPlan,
  TeamPermission,
} from '../../../shared/infrastructure/team-access'
import { hashToken } from '../../../shared/utils'
import {
  assertCanCreateTeam,
  createSeatAdditionCheckout,
  createTeamCheckout,
} from '../../payments/public'
import { ChartLayout, INVITE_TTL_MS, PreferenceTheme } from '../constants'
import { checkDomainTxtRecord } from '../domain-verification'
import * as service from '../service'

const membership = (role: TeamRole = TeamRole.OWNER) => ({
  teamId: 'team-1',
  role,
  monthlyCreditLimitPaisa: null,
  orgInstructions: null,
})

const setMembership = (role: TeamRole | null) =>
  (getActiveMembership as jest.Mock).mockResolvedValue(
    role ? membership(role) : null,
  )

const setPaymentMode = (enabled: boolean) => {
  ;(config.features as any).enablePaymentProcessor = enabled
}

let originalFlag: boolean
beforeAll(() => {
  originalFlag = config.features.enablePaymentProcessor
})
afterAll(() => setPaymentMode(originalFlag))

beforeEach(() => {
  jest.resetAllMocks()
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  setPaymentMode(false)
})

describe('requireMembership', () => {
  it('throws NotFound without an active team', async () => {
    setMembership(null)
    await expect(service.requireMembership('u1')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('returns the membership for a plain member', async () => {
    setMembership(TeamRole.MEMBER)
    await expect(service.requireMembership('u1')).resolves.toMatchObject({
      teamId: 'team-1',
      role: TeamRole.MEMBER,
    })
  })

  it('forbids a MEMBER when a management permission is required', async () => {
    setMembership(TeamRole.MEMBER)
    await expect(
      service.requireMembership('u1', {
        permission: TeamPermission.SETTINGS_MANAGE,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('words owner-only permissions as owner-only', async () => {
    setMembership(TeamRole.ADMIN)
    await expect(
      service.requireMembership('u1', {
        permission: TeamPermission.TEAM_DELETE,
      }),
    ).rejects.toThrow('Only the workspace owner can do this')
  })

  it.each([TeamRole.OWNER, TeamRole.ADMIN])(
    'allows %s when admin is required',
    async (role) => {
      setMembership(role)
      await expect(
        service.requireMembership('u1', {
          permission: TeamPermission.SETTINGS_MANAGE,
        }),
      ).resolves.toMatchObject({ role })
    },
  )
})

describe('createTeam', () => {
  const input = { name: 'Fund', seatCount: 5 }

  it('payment mode returns a checkout and creates nothing', async () => {
    setPaymentMode(true)
    const checkout = { checkoutUrl: 'https://pay' }
    ;(createTeamCheckout as jest.Mock).mockResolvedValue(checkout)

    const out = await service.createTeam('u1', input)

    expect(out).toEqual({ checkout })
    expect(createTeamCheckout).toHaveBeenCalledWith('u1', {
      teamName: 'Fund',
      seatCount: 5,
    })
    expect(mockPrisma.team.create).not.toHaveBeenCalled()
  })

  it('bypass mode creates the team with an OWNER member and sets plan TEAM', async () => {
    mockPrisma.team.create.mockResolvedValue({ id: 'team-9' })

    const out = await service.createTeam('u1', input)

    expect(assertCanCreateTeam).toHaveBeenCalledWith('u1')
    expect(mockPrisma.team.create).toHaveBeenCalledWith({
      data: {
        name: 'Fund',
        ownerId: 'u1',
        seatCapacity: 5,
        members: { create: { userId: 'u1', role: TeamRole.OWNER } },
      },
    })
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { plan: PlanTier.TEAM },
    })
    expect(out).toEqual({ checkout: null, result: { teamId: 'team-9' } })
    expect(createTeamCheckout).not.toHaveBeenCalled()
  })

  it('bypass mode propagates assertCanCreateTeam failures', async () => {
    ;(assertCanCreateTeam as jest.Mock).mockRejectedValue(
      new ConflictError('nope'),
    )
    await expect(service.createTeam('u1', input)).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(mockPrisma.team.create).not.toHaveBeenCalled()
  })
})

describe('addSeats', () => {
  it('payment mode returns a seat checkout', async () => {
    setPaymentMode(true)
    const checkout = { checkoutUrl: 'https://pay' }
    ;(createSeatAdditionCheckout as jest.Mock).mockResolvedValue(checkout)

    await expect(service.addSeats('u1', 3)).resolves.toEqual({ checkout })
    expect(createSeatAdditionCheckout).toHaveBeenCalledWith('u1', 3)
    expect(mockPrisma.team.update).not.toHaveBeenCalled()
  })

  it('bypass mode increments capacity and returns the new value', async () => {
    setMembership(TeamRole.OWNER)
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({ seatCapacity: 10 })
    mockPrisma.team.update.mockResolvedValue({ seatCapacity: 15 })

    const out = await service.addSeats('u1', 5)

    expect(mockPrisma.team.update).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { seatCapacity: { increment: 5 } },
    })
    expect(out).toEqual({ checkout: null, result: { seatCapacity: 15 } })
  })

  it('bypass mode allows exactly 150 seats', async () => {
    setMembership(TeamRole.OWNER)
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({ seatCapacity: 145 })
    mockPrisma.team.update.mockResolvedValue({ seatCapacity: 150 })
    await expect(service.addSeats('u1', 5)).resolves.toMatchObject({
      result: { seatCapacity: 150 },
    })
  })

  it('bypass mode rejects growing beyond 150 seats', async () => {
    setMembership(TeamRole.ADMIN)
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({ seatCapacity: 148 })
    await expect(service.addSeats('u1', 3)).rejects.toBeInstanceOf(
      BadRequestError,
    )
    expect(mockPrisma.team.update).not.toHaveBeenCalled()
  })

  it('bypass mode forbids non-admins', async () => {
    setMembership(TeamRole.MEMBER)
    await expect(service.addSeats('u1', 1)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })
})

describe('getMyTeam', () => {
  const stubTeam = (seatCapacity: number, active: number, pending: number) => {
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
      id: 'team-1',
      name: 'Fund',
      status: 'ACTIVE',
      seatCapacity,
      creditBalanceInPaisa: 500,
      orgInstructions: 'be nice',
      domains: [{ id: 'd1' }],
      subscription: { status: 'ACTIVE' },
    })
    mockPrisma.teamMember.count.mockResolvedValue(active)
    mockPrisma.teamInvite.count.mockResolvedValue(pending)
  }

  it('computes seat math from active members and pending invites', async () => {
    setMembership(TeamRole.ADMIN)
    stubTeam(10, 4, 3)

    const out = await service.getMyTeam('u1')

    expect(out.seats).toEqual({
      capacity: 10,
      active: 4,
      pendingInvites: 3,
      available: 3,
    })
    expect(out).toMatchObject({
      id: 'team-1',
      name: 'Fund',
      status: 'ACTIVE',
      role: TeamRole.ADMIN,
      creditBalanceInPaisa: 500,
      orgInstructions: 'be nice',
      domains: [{ id: 'd1' }],
      subscription: { status: 'ACTIVE' },
    })
    const inviteWhere = mockPrisma.teamInvite.count.mock.calls[0][0].where
    expect(inviteWhere.teamId).toBe('team-1')
    expect(inviteWhere.expiresAt.gt).toBeInstanceOf(Date)
  })

  it('never reports negative available seats', async () => {
    setMembership(TeamRole.MEMBER)
    stubTeam(5, 5, 2)
    const out = await service.getMyTeam('u1')
    expect(out.seats.available).toBe(0)
  })

  it('throws NotFound when the user has no team', async () => {
    setMembership(null)
    await expect(service.getMyTeam('u1')).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('createInvite', () => {
  const stubSeats = (
    capacity: number,
    active: number,
    pending: number,
    existingUser: any = null,
  ) => {
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
      seatCapacity: capacity,
    })
    mockPrisma.teamMember.count.mockResolvedValue(active)
    mockPrisma.teamInvite.count.mockResolvedValue(pending)
    mockPrisma.user.findUnique.mockResolvedValue(existingUser)
    mockPrisma.teamInvite.create.mockImplementation(async ({ data }: any) => ({
      id: 'inv-1',
      ...data,
    }))
  }

  it('forbids non-admins', async () => {
    setMembership(TeamRole.MEMBER)
    await expect(
      service.createInvite('u1', { email: 'a@b.com', role: 'MEMBER' }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('only the owner may invite an ADMIN', async () => {
    setMembership(TeamRole.ADMIN)
    await expect(
      service.createInvite('u1', { email: 'a@b.com', role: 'ADMIN' }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(mockPrisma.teamInvite.create).not.toHaveBeenCalled()
  })

  it('lets the owner invite an ADMIN', async () => {
    setMembership(TeamRole.OWNER)
    stubSeats(5, 1, 0)
    const out = await service.createInvite('u1', {
      email: 'a@b.com',
      role: 'ADMIN',
    })
    expect(out.invite.role).toBe('ADMIN')
  })

  it('rejects with Conflict when the user already belongs to a workspace', async () => {
    setMembership(TeamRole.OWNER)
    stubSeats(5, 1, 0, { teamMembers: [{ id: 'm1' }] })
    await expect(
      service.createInvite('u1', { email: 'a@b.com', role: 'MEMBER' }),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('allows an existing user with no membership', async () => {
    setMembership(TeamRole.OWNER)
    stubSeats(5, 1, 0, { teamMembers: [] })
    await expect(
      service.createInvite('u1', { email: 'a@b.com', role: 'MEMBER' }),
    ).resolves.toBeDefined()
  })

  it('rejects when activeSeats + pendingInvites reaches capacity', async () => {
    setMembership(TeamRole.ADMIN)
    stubSeats(5, 3, 2)
    await expect(
      service.createInvite('u1', { email: 'a@b.com', role: 'MEMBER' }),
    ).rejects.toThrow('No seats available')
    expect(mockPrisma.teamInvite.create).not.toHaveBeenCalled()
  })

  it('accepts when one seat is still free', async () => {
    setMembership(TeamRole.ADMIN)
    stubSeats(5, 3, 1)
    await expect(
      service.createInvite('u1', { email: 'a@b.com', role: 'MEMBER' }),
    ).resolves.toBeDefined()
  })

  it('excludes the re-invited email from the pending count', async () => {
    setMembership(TeamRole.OWNER)
    stubSeats(5, 3, 1)
    await service.createInvite('u1', { email: 'again@b.com', role: 'MEMBER' })

    expect(mockPrisma.teamInvite.count.mock.calls[0][0].where.email).toEqual({
      not: 'again@b.com',
    })
    expect(mockPrisma.teamInvite.deleteMany).toHaveBeenCalledWith({
      where: { teamId: 'team-1', email: 'again@b.com' },
    })
    const deleteOrder =
      mockPrisma.teamInvite.deleteMany.mock.invocationCallOrder[0]
    const createOrder = mockPrisma.teamInvite.create.mock.invocationCallOrder[0]
    expect(deleteOrder).toBeLessThan(createOrder)
  })

  it('returns the raw token only in the link and stores only its hash', async () => {
    setMembership(TeamRole.OWNER)
    stubSeats(5, 1, 0)
    const before = Date.now()

    const out = await service.createInvite('u1', {
      email: 'a@b.com',
      role: 'MEMBER',
    })

    const rawToken = out.inviteLink.split('token=')[1]
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/)
    expect(out.inviteLink).toBe(
      `${config.server.frontendUrl}/teams/invite?token=${rawToken}`,
    )

    const stored = mockPrisma.teamInvite.create.mock.calls[0][0].data
    expect(stored.token).toBe(hashToken(rawToken))
    expect(stored.token).not.toBe(rawToken)
    expect(stored.teamId).toBe('team-1')
    expect(stored.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + INVITE_TTL_MS,
    )

    expect(JSON.stringify(out.invite)).not.toContain(rawToken)
    expect(out.invite).toEqual({
      id: 'inv-1',
      email: 'a@b.com',
      role: 'MEMBER',
      expiresAt: stored.expiresAt,
    })
  })
})

describe('acceptInvite', () => {
  const futureInvite = (overrides: Record<string, any> = {}) => ({
    id: 'inv-1',
    teamId: 'team-1',
    email: 'Me@Fund.com',
    role: TeamRole.MEMBER,
    expiresAt: new Date(Date.now() + 60_000),
    team: { status: 'ACTIVE', seatCapacity: 3 },
    ...overrides,
  })

  beforeEach(() => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      email: 'me@fund.com',
    })
    mockPrisma.teamMember.findUnique.mockResolvedValue(null)
    mockPrisma.teamMember.count.mockResolvedValue(1)
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({ seatCapacity: 3 })
  })

  it('rejects unknown tokens', async () => {
    mockPrisma.teamInvite.findUnique.mockResolvedValue(null)
    await expect(service.acceptInvite('u1', 'raw')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('looks the invite up by the token hash', async () => {
    mockPrisma.teamInvite.findUnique.mockResolvedValue(futureInvite())
    await service.acceptInvite('u1', 'raw')
    expect(mockPrisma.teamInvite.findUnique.mock.calls[0][0].where).toEqual({
      token: hashToken('raw'),
    })
  })

  it('rejects expired invites', async () => {
    mockPrisma.teamInvite.findUnique.mockResolvedValue(
      futureInvite({ expiresAt: new Date(Date.now() - 1) }),
    )
    await expect(service.acceptInvite('u1', 'raw')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('rejects when the workspace is no longer active', async () => {
    mockPrisma.teamInvite.findUnique.mockResolvedValue(
      futureInvite({ team: { status: 'CANCELLED', seatCapacity: 3 } }),
    )
    await expect(service.acceptInvite('u1', 'raw')).rejects.toBeInstanceOf(
      BadRequestError,
    )
  })

  it('rejects an email mismatch', async () => {
    mockPrisma.teamInvite.findUnique.mockResolvedValue(futureInvite())
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      email: 'other@fund.com',
    })
    await expect(service.acceptInvite('u1', 'raw')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(mockPrisma.teamMember.create).not.toHaveBeenCalled()
  })

  it('rejects when the user already belongs to a workspace', async () => {
    mockPrisma.teamInvite.findUnique.mockResolvedValue(futureInvite())
    mockPrisma.teamMember.findUnique.mockResolvedValue({ id: 'm0' })
    await expect(service.acceptInvite('u1', 'raw')).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(mockPrisma.teamMember.create).not.toHaveBeenCalled()
  })

  it('rejects when there are no free seats', async () => {
    mockPrisma.teamInvite.findUnique.mockResolvedValue(futureInvite())
    mockPrisma.teamMember.count.mockResolvedValue(3)
    await expect(service.acceptInvite('u1', 'raw')).rejects.toThrow(
      'no free seats',
    )
    expect(mockPrisma.teamMember.create).not.toHaveBeenCalled()
  })

  it('joins the team, sets plan TEAM and deletes the invite', async () => {
    mockPrisma.teamInvite.findUnique.mockResolvedValue(
      futureInvite({ role: TeamRole.ADMIN }),
    )

    const out = await service.acceptInvite('u1', 'raw')

    expect(mockPrisma.teamMember.create).toHaveBeenCalledWith({
      data: { teamId: 'team-1', userId: 'u1', role: TeamRole.ADMIN },
    })
    expect(mockPrisma.teamInvite.delete).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
    })
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { plan: PlanTier.TEAM },
    })
    expect(out).toEqual({ teamId: 'team-1', role: TeamRole.ADMIN })
  })
})

describe('removeMember', () => {
  const target = (role: TeamRole, teamId = 'team-1') => ({
    id: 'mem-2',
    teamId,
    role,
    userId: 'u2',
  })

  it('hard-deletes the member and falls back to the resolved plan', async () => {
    setMembership(TeamRole.ADMIN)
    mockPrisma.teamMember.findUnique.mockResolvedValue(target(TeamRole.MEMBER))
    ;(resolveFallbackPlan as jest.Mock).mockResolvedValue(PlanTier.PRO)

    await service.removeMember('u1', 'u2')

    expect(mockPrisma.teamMember.delete).toHaveBeenCalledWith({
      where: { id: 'mem-2' },
    })
    expect(resolveFallbackPlan).toHaveBeenCalledWith('u2', mockPrisma)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { plan: PlanTier.PRO },
    })
  })

  it('falls back to FREE when there is no personal subscription', async () => {
    setMembership(TeamRole.OWNER)
    mockPrisma.teamMember.findUnique.mockResolvedValue(target(TeamRole.ADMIN))
    ;(resolveFallbackPlan as jest.Mock).mockResolvedValue(PlanTier.FREE)

    await service.removeMember('u1', 'u2')

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { plan: PlanTier.FREE },
    })
  })

  it('throws NotFound when the target is unknown', async () => {
    setMembership(TeamRole.OWNER)
    mockPrisma.teamMember.findUnique.mockResolvedValue(null)
    await expect(service.removeMember('u1', 'u2')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('throws NotFound when the target is in another team', async () => {
    setMembership(TeamRole.OWNER)
    mockPrisma.teamMember.findUnique.mockResolvedValue(
      target(TeamRole.MEMBER, 'team-other'),
    )
    await expect(service.removeMember('u1', 'u2')).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(mockPrisma.teamMember.delete).not.toHaveBeenCalled()
  })

  it('never removes the owner', async () => {
    setMembership(TeamRole.OWNER)
    mockPrisma.teamMember.findUnique.mockResolvedValue(target(TeamRole.OWNER))
    await expect(service.removeMember('u1', 'u2')).rejects.toThrow(
      'owner cannot be removed',
    )
    expect(mockPrisma.teamMember.delete).not.toHaveBeenCalled()
  })

  it('only the owner can remove an admin', async () => {
    setMembership(TeamRole.ADMIN)
    mockPrisma.teamMember.findUnique.mockResolvedValue(target(TeamRole.ADMIN))
    await expect(service.removeMember('u1', 'u2')).rejects.toThrow(
      'Only the owner can remove an admin',
    )
    expect(mockPrisma.teamMember.delete).not.toHaveBeenCalled()
  })

  it('forbids non-admin actors', async () => {
    setMembership(TeamRole.MEMBER)
    await expect(service.removeMember('u1', 'u2')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })
})

describe('domains', () => {
  const record = (overrides: Record<string, any> = {}) => ({
    id: 'dom-1',
    domain: 'fund.com',
    verificationToken: 'tok',
    isVerified: false,
    restrictOrgCreation: true,
    ...overrides,
  })

  describe('addDomain', () => {
    beforeEach(() => setMembership(TeamRole.ADMIN))

    it('rejects public email providers', async () => {
      await expect(
        service.addDomain('u1', {
          domain: 'gmail.com',
          restrictOrgCreation: true,
        }),
      ).rejects.toBeInstanceOf(BadRequestError)
      expect(mockPrisma.teamDomain.create).not.toHaveBeenCalled()
    })

    it('creates the domain with a random token and marks it verified when DNS matches', async () => {
      mockPrisma.teamDomain.create.mockImplementation(async ({ data }: any) =>
        record({ verificationToken: data.verificationToken }),
      )
      ;(checkDomainTxtRecord as jest.Mock).mockResolvedValue(true)

      const out = await service.addDomain('u1', {
        domain: 'fund.com',
        restrictOrgCreation: false,
      })

      const data = mockPrisma.teamDomain.create.mock.calls[0][0].data
      expect(data).toMatchObject({
        teamId: 'team-1',
        domain: 'fund.com',
        restrictOrgCreation: false,
      })
      expect(data.verificationToken).toMatch(/^[0-9a-f]{32}$/)
      expect(checkDomainTxtRecord).toHaveBeenCalledWith(
        'fund.com',
        data.verificationToken,
      )
      expect(mockPrisma.teamDomain.update).toHaveBeenCalledWith({
        where: { id: 'dom-1' },
        data: { isVerified: true },
      })
      expect(out.isVerified).toBe(true)
      expect(out.verification).toEqual({
        recordType: 'TXT',
        recordName: '_rec.fund.com',
        recordValue: `val=${data.verificationToken}`,
      })
    })

    it('stays unverified (and does not update) when DNS does not match', async () => {
      mockPrisma.teamDomain.create.mockResolvedValue(record())
      ;(checkDomainTxtRecord as jest.Mock).mockResolvedValue(false)

      const out = await service.addDomain('u1', {
        domain: 'fund.com',
        restrictOrgCreation: true,
      })

      expect(out.isVerified).toBe(false)
      expect(mockPrisma.teamDomain.update).not.toHaveBeenCalled()
    })
  })

  describe('verifyDomain', () => {
    beforeEach(() => setMembership(TeamRole.OWNER))

    it('throws NotFound for an unknown domain', async () => {
      mockPrisma.teamDomain.findFirst.mockResolvedValue(null)
      await expect(
        service.verifyDomain('u1', 'fund.com'),
      ).rejects.toBeInstanceOf(NotFoundError)
      expect(mockPrisma.teamDomain.findFirst).toHaveBeenCalledWith({
        where: { teamId: 'team-1', domain: 'fund.com' },
      })
    })

    it('short-circuits when already verified', async () => {
      mockPrisma.teamDomain.findFirst.mockResolvedValue(
        record({ isVerified: true }),
      )
      const out = await service.verifyDomain('u1', 'fund.com')
      expect(out.isVerified).toBe(true)
      expect(checkDomainTxtRecord).not.toHaveBeenCalled()
      expect(mockPrisma.teamDomain.update).not.toHaveBeenCalled()
    })

    it('verifies a pending domain via the TXT lookup', async () => {
      mockPrisma.teamDomain.findFirst.mockResolvedValue(record())
      ;(checkDomainTxtRecord as jest.Mock).mockResolvedValue(true)
      const out = await service.verifyDomain('u1', 'fund.com')
      expect(checkDomainTxtRecord).toHaveBeenCalledWith('fund.com', 'tok')
      expect(mockPrisma.teamDomain.update).toHaveBeenCalledTimes(1)
      expect(out.isVerified).toBe(true)
    })

    it('reports pending when the record is not published yet', async () => {
      mockPrisma.teamDomain.findFirst.mockResolvedValue(record())
      ;(checkDomainTxtRecord as jest.Mock).mockResolvedValue(false)
      const out = await service.verifyDomain('u1', 'fund.com')
      expect(out.isVerified).toBe(false)
      expect(out.verification.recordValue).toBe('val=tok')
    })
  })
})

describe('updateInstructions', () => {
  beforeEach(() => {
    setMembership(TeamRole.ADMIN)
    mockPrisma.team.update.mockImplementation(async ({ data }: any) => data)
  })

  it('stores the provided instructions', async () => {
    const out = await service.updateInstructions('u1', 'Be concise')
    expect(mockPrisma.team.update).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { orgInstructions: 'Be concise' },
      select: { orgInstructions: true },
    })
    expect(out).toEqual({ orgInstructions: 'Be concise' })
  })

  it.each([null, ''])('stores null for %p', async (value) => {
    const out = await service.updateInstructions('u1', value)
    expect(out).toEqual({ orgInstructions: null })
  })

  it('forbids non-admins', async () => {
    setMembership(TeamRole.MEMBER)
    await expect(service.updateInstructions('u1', 'x')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })
})

describe('setMemberCreditLimit', () => {
  beforeEach(() => setMembership(TeamRole.ADMIN))

  it('updates the limit for a member of the same team', async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue({
      id: 'mem-2',
      teamId: 'team-1',
    })
    mockPrisma.teamMember.update.mockResolvedValue({
      userId: 'u2',
      monthlyCreditLimitPaisa: 1000,
    })

    const out = await service.setMemberCreditLimit('u1', 'u2', 1000)

    expect(mockPrisma.teamMember.update).toHaveBeenCalledWith({
      where: { id: 'mem-2' },
      data: { monthlyCreditLimitPaisa: 1000 },
      select: { userId: true, monthlyCreditLimitPaisa: true },
    })
    expect(out).toEqual({ userId: 'u2', monthlyCreditLimitPaisa: 1000 })
  })

  it('supports clearing the limit with null', async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue({
      id: 'mem-2',
      teamId: 'team-1',
    })
    mockPrisma.teamMember.update.mockResolvedValue({
      userId: 'u2',
      monthlyCreditLimitPaisa: null,
    })
    await service.setMemberCreditLimit('u1', 'u2', null)
    expect(mockPrisma.teamMember.update.mock.calls[0][0].data).toEqual({
      monthlyCreditLimitPaisa: null,
    })
  })

  it.each([null, { id: 'm', teamId: 'other' }])(
    'throws NotFound when the target is %p',
    async (found) => {
      mockPrisma.teamMember.findUnique.mockResolvedValue(found)
      await expect(
        service.setMemberCreditLimit('u1', 'u2', 5),
      ).rejects.toBeInstanceOf(NotFoundError)
      expect(mockPrisma.teamMember.update).not.toHaveBeenCalled()
    },
  )
})

describe('preferences', () => {
  describe('getPreferences', () => {
    it('overlays personal preferences on workspace defaults', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        preferences: { theme: 'DARK' },
      })
      setMembership(TeamRole.MEMBER)
      mockPrisma.team.findUnique.mockResolvedValue({
        defaultPreferences: { theme: 'LIGHT', chartLayout: 'GRID' },
      })

      await expect(service.getPreferences('u1')).resolves.toEqual({
        workspace: { theme: 'LIGHT', chartLayout: 'GRID' },
        personal: { theme: 'DARK' },
        effective: { theme: 'DARK', chartLayout: 'GRID' },
      })
    })

    it('uses empty workspace defaults when the user has no team', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        preferences: { theme: 'DARK' },
      })
      setMembership(null)

      const out = await service.getPreferences('u1')

      expect(mockPrisma.team.findUnique).not.toHaveBeenCalled()
      expect(out).toEqual({
        workspace: {},
        personal: { theme: 'DARK' },
        effective: { theme: 'DARK' },
      })
    })

    it.each([null, ['x'], 'str'])(
      'treats non-object stored preferences (%p) as empty',
      async (stored) => {
        mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
          preferences: stored,
        })
        setMembership(TeamRole.MEMBER)
        mockPrisma.team.findUnique.mockResolvedValue({
          defaultPreferences: stored,
        })
        const out = await service.getPreferences('u1')
        expect(out).toEqual({ workspace: {}, personal: {}, effective: {} })
      },
    )

    it('handles a team row that is missing', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ preferences: null })
      setMembership(TeamRole.MEMBER)
      mockPrisma.team.findUnique.mockResolvedValue(null)
      const out = await service.getPreferences('u1')
      expect(out.workspace).toEqual({})
    })
  })

  it('updateMyPreferences merges the patch into the stored preferences', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      preferences: { theme: 'DARK', chartLayout: 'SPLIT' },
    })
    setMembership(null)

    await service.updateMyPreferences('u1', { theme: PreferenceTheme.LIGHT })

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { preferences: { theme: 'LIGHT', chartLayout: 'SPLIT' } },
    })
  })

  it('updateWorkspacePreferences merges into team defaults (admin only)', async () => {
    setMembership(TeamRole.ADMIN)
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
      defaultPreferences: { theme: 'DARK' },
    })
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ preferences: null })
    mockPrisma.team.findUnique.mockResolvedValue({
      defaultPreferences: { theme: 'DARK', chartLayout: 'GRID' },
    })

    const out = await service.updateWorkspacePreferences('u1', {
      chartLayout: ChartLayout.GRID,
    })

    expect(mockPrisma.team.update).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { defaultPreferences: { theme: 'DARK', chartLayout: 'GRID' } },
    })
    expect(out.effective).toEqual({ theme: 'DARK', chartLayout: 'GRID' })
  })

  it('updateWorkspacePreferences forbids members', async () => {
    setMembership(TeamRole.MEMBER)
    await expect(
      service.updateWorkspacePreferences('u1', {}),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('createInvite — email dispatch', () => {
  const { enqueueTeamInviteEmail } = jest.requireMock(
    '../../notifications/public',
  )

  beforeEach(() => {
    setMembership(TeamRole.OWNER)
    mockPrisma.team.findUniqueOrThrow.mockImplementation(
      async ({ select }: any) =>
        select?.name ? { name: 'Alpha Fund' } : { seatCapacity: 5 },
    )
    mockPrisma.teamMember.count.mockResolvedValue(1)
    mockPrisma.teamInvite.count.mockResolvedValue(0)
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      displayName: 'Olivia Owner',
    })
    mockPrisma.teamInvite.create.mockImplementation(async ({ data }: any) => ({
      id: 'inv-1',
      ...data,
    }))
    enqueueTeamInviteEmail.mockReset()
  })

  it('queues the invite email AND still returns the link', async () => {
    enqueueTeamInviteEmail.mockResolvedValue(undefined)

    const out = await service.createInvite('u1', {
      email: 'new@fund.com',
      role: 'MEMBER',
    })

    expect(out.emailQueued).toBe(true)
    expect(out.inviteLink).toContain('/teams/invite?token=')
    const payload = enqueueTeamInviteEmail.mock.calls[0][0]
    expect(payload).toMatchObject({
      to: 'new@fund.com',
      inviterName: 'Olivia Owner',
      teamName: 'Alpha Fund',
      role: 'MEMBER',
      inviteId: 'inv-1',
      teamId: 'team-1',
      inviteUrl: out.inviteLink,
    })
    // JSON-safe for the queue: an ISO string, not a Date.
    expect(payload.expiresAt).toBe(out.invite.expiresAt.toISOString())
  })

  it('does not fail the invite when the queue errors — reports emailQueued=false', async () => {
    enqueueTeamInviteEmail.mockRejectedValue(new Error('redis down'))

    const out = await service.createInvite('u1', {
      email: 'new@fund.com',
      role: 'MEMBER',
    })

    expect(out.emailQueued).toBe(false)
    expect(out.inviteLink).toContain('token=')
    expect(mockPrisma.teamInvite.create).toHaveBeenCalled()
  })

  it('does not queue anything when the invite itself is rejected', async () => {
    mockPrisma.teamInvite.count.mockResolvedValue(4)
    await expect(
      service.createInvite('u1', { email: 'new@fund.com', role: 'MEMBER' }),
    ).rejects.toThrow('No seats available')
    expect(enqueueTeamInviteEmail).not.toHaveBeenCalled()
  })
})

describe('listMembers', () => {
  const rows = [
    {
      userId: 'u1',
      role: TeamRole.OWNER,
      monthlyCreditLimitPaisa: null,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      user: { displayName: 'Olivia', email: 'olivia@fund.com' },
    },
    {
      userId: 'u2',
      role: TeamRole.MEMBER,
      monthlyCreditLimitPaisa: 25_000,
      createdAt: new Date('2026-09-02T00:00:00Z'),
      user: { displayName: 'Max', email: 'max@fund.com' },
    },
  ]

  beforeEach(() => mockPrisma.teamMember.findMany.mockResolvedValue(rows))

  it('gives owners/admins emails and credit limits', async () => {
    setMembership(TeamRole.ADMIN)

    const out = await service.listMembers('u1')

    expect(out).toEqual([
      expect.objectContaining({
        userId: 'u1',
        displayName: 'Olivia',
        email: 'olivia@fund.com',
        monthlyCreditLimitPaisa: null,
      }),
      expect.objectContaining({
        userId: 'u2',
        email: 'max@fund.com',
        monthlyCreditLimitPaisa: 25_000,
      }),
    ])
    expect(mockPrisma.teamMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: 'team-1' } }),
    )
  })

  it('hides emails and credit limits from plain members', async () => {
    setMembership(TeamRole.MEMBER)

    const out = await service.listMembers('u2')

    expect(out).toHaveLength(2)
    for (const member of out) {
      expect(member).not.toHaveProperty('email')
      expect(member).not.toHaveProperty('monthlyCreditLimitPaisa')
      expect(member).toHaveProperty('displayName')
      expect(member).toHaveProperty('role')
    }
  })

  it('404s for a non-member', async () => {
    setMembership(null)
    await expect(service.listMembers('u9')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})

describe('preferences — clearing with null', () => {
  it('a null field clears it from personal preferences (back to the workspace default) and keeps the rest', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      preferences: { theme: 'DARK', chartLayout: 'SPLIT', indicators: ['RSI'] },
    })
    setMembership(null)

    await service.updateMyPreferences('u1', { theme: null })

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { preferences: { chartLayout: 'SPLIT', indicators: ['RSI'] } },
    })
  })

  it('clears indicators and can set and clear in one patch', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      preferences: { theme: 'DARK', indicators: ['RSI', 'MACD'] },
    })
    setMembership(null)

    await service.updateMyPreferences('u1', {
      indicators: null,
      chartLayout: ChartLayout.GRID,
    })

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { preferences: { theme: 'DARK', chartLayout: 'GRID' } },
    })
  })

  it('an empty indicators list is a real value, not a clear', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ preferences: null })
    setMembership(null)

    await service.updateMyPreferences('u1', { indicators: [] })

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { preferences: { indicators: [] } },
    })
  })

  it('clearing workspace defaults is admin-only and leaves other defaults intact', async () => {
    setMembership(TeamRole.OWNER)
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
      defaultPreferences: { theme: 'DARK', chartLayout: 'GRID' },
    })
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ preferences: null })
    mockPrisma.team.findUnique.mockResolvedValue({
      defaultPreferences: { chartLayout: 'GRID' },
    })

    await service.updateWorkspacePreferences('u1', { theme: null })

    expect(mockPrisma.team.update).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { defaultPreferences: { chartLayout: 'GRID' } },
    })
  })
})

describe('seat reservation is race-proof (row lock + checks inside the transaction)', () => {
  const stub = (capacity: number, active: number, pending: number) => {
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
      seatCapacity: capacity,
    })
    mockPrisma.teamMember.count.mockResolvedValue(active)
    mockPrisma.teamInvite.count.mockResolvedValue(pending)
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.teamInvite.create.mockImplementation(async ({ data }: any) => ({
      id: 'inv-1',
      ...data,
    }))
  }

  beforeEach(() => {
    setMembership(TeamRole.OWNER)
    mockPrisma.$queryRaw.mockReset()
  })

  it('takes the team row lock before counting seats, and does everything in one transaction', async () => {
    stub(5, 1, 1)
    await service.createInvite('u1', { email: 'new@fund.com', role: 'MEMBER' })

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1)
    const lockedAt = mockPrisma.$queryRaw.mock.invocationCallOrder[0]
    expect(lockedAt).toBeLessThan(
      mockPrisma.teamMember.count.mock.invocationCallOrder[0],
    )
    expect(lockedAt).toBeLessThan(
      mockPrisma.teamInvite.count.mock.invocationCallOrder[0],
    )
    expect(lockedAt).toBeLessThan(
      mockPrisma.teamInvite.create.mock.invocationCallOrder[0],
    )
    // The lock targets this team's row.
    expect(mockPrisma.$queryRaw.mock.calls[0].slice(1)).toEqual(['team-1'])
  })

  it('counts only unexpired invites, so lapsed invite links free their seat', async () => {
    stub(5, 1, 0)
    await service.createInvite('u1', { email: 'new@fund.com', role: 'MEMBER' })

    expect(mockPrisma.teamInvite.count).toHaveBeenCalledWith({
      where: {
        teamId: 'team-1',
        expiresAt: { gt: expect.any(Date) },
        email: { not: 'new@fund.com' },
      },
    })
  })

  it.each([
    // capacity, active members, pending unexpired invites -> allowed?
    [5, 2, 2, true], // 4 of 5 reserved: one seat left
    [5, 2, 3, false], // 5 of 5 reserved: full
    [5, 5, 0, false], // full of members
    [5, 0, 5, false], // full of invites alone
    [2, 1, 0, true],
  ])(
    'capacity %i with %i members + %i pending invites => allowed=%s',
    async (capacity, active, pending, allowed) => {
      stub(capacity, active, pending)
      const attempt = service.createInvite('u1', {
        email: 'new@fund.com',
        role: 'MEMBER',
      })
      if (allowed) await expect(attempt).resolves.toBeDefined()
      else await expect(attempt).rejects.toThrow('No seats available')
    },
  )

  it('a rejected invite writes nothing (the old invite for that email is kept)', async () => {
    stub(5, 3, 2)
    await expect(
      service.createInvite('u1', { email: 'new@fund.com', role: 'MEMBER' }),
    ).rejects.toThrow('No seats available')
    expect(mockPrisma.teamInvite.deleteMany).not.toHaveBeenCalled()
    expect(mockPrisma.teamInvite.create).not.toHaveBeenCalled()
  })

  it('accepting an invite takes the same row lock and re-reads capacity under it', async () => {
    mockPrisma.teamInvite.findUnique.mockResolvedValue({
      id: 'inv-1',
      teamId: 'team-1',
      email: 'me@fund.com',
      role: TeamRole.MEMBER,
      expiresAt: new Date(Date.now() + 60_000),
      team: { status: 'ACTIVE', seatCapacity: 99 }, // stale value from before the lock
    })
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      email: 'me@fund.com',
    })
    mockPrisma.teamMember.findUnique.mockResolvedValue(null)
    mockPrisma.teamMember.count.mockResolvedValue(3)
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({ seatCapacity: 3 }) // actual, now full

    await expect(service.acceptInvite('u1', 'raw')).rejects.toThrow(
      'no free seats',
    )

    const lockedAt = mockPrisma.$queryRaw.mock.invocationCallOrder[0]
    expect(lockedAt).toBeLessThan(
      mockPrisma.teamMember.count.mock.invocationCallOrder[0],
    )
    expect(mockPrisma.teamMember.create).not.toHaveBeenCalled()
  })
})

describe('stored preferences are read defensively (no cast)', () => {
  const readPersonal = async (stored: unknown) => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ preferences: stored })
    setMembership(null)
    return (await service.getPreferences('u1')).personal
  }

  it('keeps every valid field', async () => {
    await expect(
      readPersonal({
        theme: 'DARK',
        chartLayout: 'GRID',
        indicators: ['RSI', 'MACD'],
      }),
    ).resolves.toEqual({
      theme: 'DARK',
      chartLayout: 'GRID',
      indicators: ['RSI', 'MACD'],
    })
  })

  it('drops only the corrupt field — one bad value never wipes the good ones', async () => {
    await expect(
      readPersonal({
        theme: 'PINK',
        chartLayout: 'SPLIT',
        indicators: ['RSI'],
      }),
    ).resolves.toEqual({ chartLayout: 'SPLIT', indicators: ['RSI'] })

    await expect(
      readPersonal({ theme: 'LIGHT', chartLayout: 42, indicators: 'RSI' }),
    ).resolves.toEqual({ theme: 'LIGHT' })
  })

  it('drops an indicators list that breaks the limits (too many / too long / blank names)', async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => 'I' + i)
    await expect(
      readPersonal({ theme: 'DARK', indicators: tooMany }),
    ).resolves.toEqual({ theme: 'DARK' })
    await expect(
      readPersonal({ indicators: ['x'.repeat(41)] }),
    ).resolves.toEqual({})
    await expect(readPersonal({ indicators: [''] })).resolves.toEqual({})
    await expect(readPersonal({ indicators: [7] })).resolves.toEqual({})
  })

  it('strips keys it does not know about', async () => {
    await expect(
      readPersonal({
        theme: 'DARK',
        fontSize: 18,
        __proto__: { admin: true },
        note: 'x',
      }),
    ).resolves.toEqual({ theme: 'DARK' })
  })

  it.each([null, 'a string', 42, true, [], ['THEME']])(
    'treats %j as an empty preferences object',
    async (stored) => {
      await expect(readPersonal(stored)).resolves.toEqual({})
    },
  )

  it('a corrupt stored field is repaired, not propagated, when a new patch is saved', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      preferences: { theme: 'PINK', chartLayout: 'SPLIT' },
    })
    setMembership(null)

    await service.updateMyPreferences('u1', { indicators: ['RSI'] })

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { preferences: { chartLayout: 'SPLIT', indicators: ['RSI'] } },
    })
  })
})
