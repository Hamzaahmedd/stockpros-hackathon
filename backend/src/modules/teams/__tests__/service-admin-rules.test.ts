const mockPrisma: any = {
  team: {
    findUniqueOrThrow: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  teamMember: {
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn(),
  },
  teamInvite: {
    count: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    findUnique: jest.fn(),
  },
  teamDomain: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  teamAuditLog: { create: jest.fn() },
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
import { TeamRole } from '@prisma/client'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/errors'
import {
  getActiveMembership,
  resolveFallbackPlan,
} from '../../../shared/infrastructure/team-access'
import { hashToken } from '../../../shared/utils'
import { PreferenceTheme } from '../constants'
import { checkDomainTxtRecord } from '../domain-verification'
import * as service from '../service'

const TEAM = 'team-1'
const asRole = (role: TeamRole) =>
  (getActiveMembership as jest.Mock).mockResolvedValue({
    teamId: TEAM,
    role,
    monthlyCreditLimitPaisa: null,
    orgInstructions: null,
  })
const audits = () =>
  mockPrisma.teamAuditLog.create.mock.calls.map(
    ([arg]: any[]) => arg.data.action,
  )

beforeEach(() => {
  jest.resetAllMocks()
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  ;(resolveFallbackPlan as jest.Mock).mockResolvedValue('FREE')
  Object.assign(config.features, { enablePaymentProcessor: false })
  asRole(TeamRole.OWNER)
})

describe('removeMember — self-removal and admin protection', () => {
  it('blocks removing yourself — leaving has its own route', async () => {
    asRole(TeamRole.ADMIN)
    await expect(service.removeMember('a1', 'a1')).rejects.toThrow(
      'Leave workspace',
    )
    expect(mockPrisma.teamMember.delete).not.toHaveBeenCalled()
  })

  it('lets only the owner remove an admin', async () => {
    asRole(TeamRole.ADMIN)
    mockPrisma.teamMember.findUnique.mockResolvedValue({
      id: 'm2',
      teamId: TEAM,
      role: TeamRole.ADMIN,
    })
    await expect(service.removeMember('a1', 'a2')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('records the removal without any personal data', async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue({
      id: 'm2',
      teamId: TEAM,
      role: TeamRole.MEMBER,
    })
    await service.removeMember('owner', 'u2')

    expect(mockPrisma.teamMember.delete).toHaveBeenCalledWith({
      where: { id: 'm2' },
    })
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { plan: 'FREE' },
    })
    expect(mockPrisma.teamAuditLog.create.mock.calls[0][0].data).toMatchObject({
      teamId: TEAM,
      actorUserId: 'owner',
      targetUserId: 'u2',
      action: 'MEMBER_REMOVED',
      metadata: { role: 'MEMBER' },
    })
  })
})

describe('setMemberCreditLimit — who can be limited', () => {
  const target = (role: TeamRole) =>
    mockPrisma.teamMember.findUnique.mockResolvedValue({
      id: 'm2',
      teamId: TEAM,
      role,
    })

  it('never limits the owner', async () => {
    target(TeamRole.OWNER)
    await expect(
      service.setMemberCreditLimit('a1', 'o', 100),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('reserves admin limits for the owner', async () => {
    asRole(TeamRole.ADMIN)
    target(TeamRole.ADMIN)
    await expect(
      service.setMemberCreditLimit('a1', 'a2', 100),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('404s for a member of another workspace', async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue({
      id: 'm2',
      teamId: 'other',
      role: TeamRole.MEMBER,
    })
    await expect(
      service.setMemberCreditLimit('owner', 'u2', 100),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it.each([
    [500, false],
    [null, true],
  ])(
    'sets %s and records whether it is unlimited',
    async (limit, unlimited) => {
      target(TeamRole.MEMBER)
      mockPrisma.teamMember.update.mockResolvedValue({
        userId: 'u2',
        monthlyCreditLimitPaisa: limit,
      })
      await service.setMemberCreditLimit('owner', 'u2', limit)

      expect(
        mockPrisma.teamAuditLog.create.mock.calls[0][0].data,
      ).toMatchObject({
        action: 'CREDIT_LIMIT_SET',
        targetUserId: 'u2',
        metadata: { unlimited },
      })
    },
  )
})

describe('seats and a scheduled reduction', () => {
  const team = (scheduled: number | null) =>
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
      seatCapacity: 10,
      scheduledSeatCapacity: scheduled,
    })

  describe('createInvite', () => {
    const invite = () =>
      service.createInvite('owner', { email: 'n@fund.com', role: 'MEMBER' })

    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(null)
      mockPrisma.teamInvite.create.mockImplementation(
        async ({ data }: any) => ({
          id: 'inv-1',
          ...data,
        }),
      )
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        displayName: 'Olivia',
      })
    })

    it('cannot invite past a scheduled reduction, even with seats left on paper', async () => {
      team(4) // capacity 10, but only 4 after renewal
      mockPrisma.teamMember.count.mockResolvedValue(3)
      mockPrisma.teamInvite.count.mockResolvedValue(1)

      await expect(invite()).rejects.toBeInstanceOf(ConflictError)
      expect(mockPrisma.teamInvite.create).not.toHaveBeenCalled()
    })

    it('still invites up to the reduced count', async () => {
      team(4)
      mockPrisma.teamMember.count.mockResolvedValue(2)
      mockPrisma.teamInvite.count.mockResolvedValue(1)

      await expect(invite()).resolves.toMatchObject({
        invite: { email: 'n@fund.com' },
      })
      expect(audits()).toEqual(['MEMBER_INVITED'])
    })

    it('uses the full capacity when nothing is scheduled', async () => {
      team(null)
      mockPrisma.teamMember.count.mockResolvedValue(3)
      mockPrisma.teamInvite.count.mockResolvedValue(1)
      await expect(invite()).resolves.toBeDefined()
    })

    it('reserves admin invites for the owner', async () => {
      asRole(TeamRole.ADMIN)
      await expect(
        service.createInvite('a1', { email: 'n@fund.com', role: 'ADMIN' }),
      ).rejects.toBeInstanceOf(ForbiddenError)
    })
  })

  describe('acceptInvite', () => {
    beforeEach(() => {
      mockPrisma.teamInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        teamId: TEAM,
        email: 'n@fund.com',
        role: TeamRole.MEMBER,
        expiresAt: new Date(Date.now() + 60_000),
        team: { status: 'ACTIVE', seatCapacity: 10 },
      })
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        email: 'n@fund.com',
      })
      mockPrisma.teamMember.findUnique.mockResolvedValue(null)
    })

    it('refuses once the reduced seat count is already filled', async () => {
      team(4)
      mockPrisma.teamMember.count.mockResolvedValue(4)
      await expect(service.acceptInvite('u9', 'raw')).rejects.toBeInstanceOf(
        ConflictError,
      )
      expect(mockPrisma.teamMember.create).not.toHaveBeenCalled()
    })

    it('seats the user and records the acceptance', async () => {
      team(4)
      mockPrisma.teamMember.count.mockResolvedValue(3)
      await service.acceptInvite('u9', 'raw')

      expect(mockPrisma.teamInvite.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { token: hashToken('raw') } }),
      )
      expect(
        mockPrisma.teamAuditLog.create.mock.calls[0][0].data,
      ).toMatchObject({
        action: 'INVITE_ACCEPTED',
        actorUserId: 'u9',
        teamId: TEAM,
      })
    })
  })

  describe('getMyTeam', () => {
    const load = (role: TeamRole, scheduled: number | null) => {
      asRole(role)
      mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
        id: TEAM,
        name: 'Alpha Fund',
        status: 'ACTIVE',
        seatCapacity: 10,
        scheduledSeatCapacity: scheduled,
        billingEmail: 'billing@fund.com',
        creditBalanceInPaisa: 0,
        orgInstructions: null,
        domains: [],
        subscription: null,
      })
      mockPrisma.teamMember.count.mockResolvedValue(3)
      mockPrisma.teamInvite.count.mockResolvedValue(1)
      return service.getMyTeam('u1')
    }

    it('shows the scheduled capacity and counts available seats against it', async () => {
      const team = await load(TeamRole.OWNER, 6)
      expect(team.seats).toMatchObject({
        capacity: 10,
        scheduledCapacity: 6,
        available: 2, // 6 effective − 3 members − 1 pending
      })
    })

    it('shows the billing contact to people who manage billing only', async () => {
      await expect(load(TeamRole.ADMIN, null)).resolves.toMatchObject({
        billingEmail: 'billing@fund.com',
      })
      await expect(load(TeamRole.MEMBER, null)).resolves.toMatchObject({
        billingEmail: null,
      })
    })
  })
})

describe('audit of settings changes', () => {
  it('records a seat addition made in bypass mode', async () => {
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({ seatCapacity: 5 })
    mockPrisma.team.update.mockResolvedValue({ seatCapacity: 8 })

    await service.addSeats('owner', 3)

    expect(mockPrisma.teamAuditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'SEATS_ADDED',
      metadata: { seatCount: 3 },
    })
  })

  it('records instruction edits without storing the text', async () => {
    mockPrisma.team.update.mockResolvedValue({ orgInstructions: 'Be brief' })
    await service.updateInstructions('owner', 'Be brief')

    const audit = mockPrisma.teamAuditLog.create.mock.calls[0][0].data
    expect(audit).toMatchObject({
      action: 'SETTINGS_UPDATED',
      metadata: { setting: 'orgInstructions' },
    })
    expect(JSON.stringify(audit)).not.toContain('Be brief')
  })

  it('records workspace preference changes', async () => {
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
      defaultPreferences: null,
    })
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ preferences: null })
    mockPrisma.team.findUnique.mockResolvedValue({ defaultPreferences: null })

    await service.updateWorkspacePreferences('owner', {
      theme: PreferenceTheme.DARK,
    })

    expect(audits()).toEqual(['SETTINGS_UPDATED'])
  })

  it('records a claimed domain and, once proven, its verification', async () => {
    mockPrisma.teamDomain.create.mockResolvedValue({
      id: 'd1',
      domain: 'fund.com',
      verificationToken: 'tok',
      isVerified: false,
      restrictOrgCreation: true,
    })
    ;(checkDomainTxtRecord as jest.Mock).mockResolvedValue(true)

    await service.addDomain('owner', {
      domain: 'fund.com',
      restrictOrgCreation: true,
    })

    expect(audits()).toEqual(['DOMAIN_ADDED', 'DOMAIN_VERIFIED'])
  })

  it('does not re-record a domain that was already verified', async () => {
    mockPrisma.teamDomain.findFirst.mockResolvedValue({
      id: 'd1',
      domain: 'fund.com',
      verificationToken: 'tok',
      isVerified: true,
      restrictOrgCreation: true,
    })
    await service.verifyDomain('owner', 'fund.com')
    expect(mockPrisma.teamAuditLog.create).not.toHaveBeenCalled()
  })
})

describe('a lapsed workspace does not trap its members', () => {
  const lapsedWhere = { team: { status: { not: 'ACTIVE' } } }

  it('accepting an invite first releases a seat in a lapsed workspace', async () => {
    mockPrisma.teamInvite.findUnique.mockResolvedValue({
      id: 'inv-1',
      teamId: TEAM,
      email: 'n@fund.com',
      role: TeamRole.MEMBER,
      expiresAt: new Date(Date.now() + 60_000),
      team: { status: 'ACTIVE', seatCapacity: 10 },
    })
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ email: 'n@fund.com' })
    mockPrisma.teamMember.findUnique.mockResolvedValue(null)
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
      seatCapacity: 10,
      scheduledSeatCapacity: null,
    })
    mockPrisma.teamMember.count.mockResolvedValue(1)

    await service.acceptInvite('u9', 'raw')

    expect(mockPrisma.teamMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u9', ...lapsedWhere },
    })
    expect(mockPrisma.teamMember.create).toHaveBeenCalled()
  })

  it('a seat in a LIVE workspace still blocks accepting another invite', async () => {
    mockPrisma.teamInvite.findUnique.mockResolvedValue({
      id: 'inv-1',
      teamId: TEAM,
      email: 'n@fund.com',
      role: TeamRole.MEMBER,
      expiresAt: new Date(Date.now() + 60_000),
      team: { status: 'ACTIVE', seatCapacity: 10 },
    })
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ email: 'n@fund.com' })
    // deleteMany (the lapsed-only release) leaves a live seat alone, so it is still found.
    mockPrisma.teamMember.findUnique.mockResolvedValue({ id: 'live-seat' })

    await expect(service.acceptInvite('u9', 'raw')).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(mockPrisma.teamMember.create).not.toHaveBeenCalled()
  })

  it('inviting someone whose old workspace lapsed is allowed; only a live seat conflicts', async () => {
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
      seatCapacity: 10,
      scheduledSeatCapacity: null,
    })
    mockPrisma.teamMember.count.mockResolvedValue(1)
    mockPrisma.teamInvite.count.mockResolvedValue(0)
    mockPrisma.teamInvite.create.mockImplementation(async ({ data }: any) => ({
      id: 'inv-1',
      ...data,
    }))
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ displayName: 'O' })
    mockPrisma.user.findUnique.mockResolvedValue({ teamMembers: [] })

    await service.createInvite('owner', { email: 'n@fund.com', role: 'MEMBER' })

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'n@fund.com' },
      select: {
        teamMembers: {
          where: { team: { status: 'ACTIVE' } },
          select: { id: true },
        },
      },
    })
  })

  it('creating a workspace (bypass) releases a lapsed seat first', async () => {
    mockPrisma.team.create = jest.fn().mockResolvedValue({ id: 'new-team' })
    await service.createTeam('u9', { name: 'Fresh Fund', seatCount: 3 })

    expect(mockPrisma.teamMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u9', ...lapsedWhere },
    })
  })
})
