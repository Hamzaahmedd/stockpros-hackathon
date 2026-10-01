export {}

const mockPrisma: any = {
  team: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
  teamMember: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  teamInvite: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  teamDomain: { findMany: jest.fn(), deleteMany: jest.fn() },
  teamAuditLog: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  subscription: { updateMany: jest.fn() },
  sharedWatchlist: { findMany: jest.fn(), deleteMany: jest.fn() },
  sharedScreener: { findMany: jest.fn(), deleteMany: jest.fn() },
  sharedResearchNote: { findMany: jest.fn(), deleteMany: jest.fn() },
  paymentTransaction: { findMany: jest.fn() },
  user: { findMany: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  ...jest.requireActual('../../../shared/infrastructure/team-access'),
  resolveFallbackPlan: jest.fn(),
}))

jest.mock('../service', () => ({
  requireMembership: jest.fn(),
  lockTeamRow: jest.fn(),
  detachMember: jest.fn(),
  dispatchInviteEmail: jest.fn(),
}))

import config from '@/config'
import { TeamRole } from '@prisma/client'
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/errors'
import {
  resolveFallbackPlan,
  TeamPermission,
} from '../../../shared/infrastructure/team-access'
import * as admin from '../admin-service'
import {
  detachMember,
  dispatchInviteEmail,
  lockTeamRow,
  requireMembership,
} from '../service'

const TEAM = 'team-1'
const membership = (role: TeamRole) => ({
  teamId: TEAM,
  role,
  monthlyCreditLimitPaisa: null,
  orgInstructions: null,
})
const asRole = (role: TeamRole) =>
  (requireMembership as jest.Mock).mockResolvedValue(membership(role))

const auditActions = () =>
  mockPrisma.teamAuditLog.create.mock.calls.map(
    ([arg]: any[]) => arg.data.action,
  )

beforeEach(() => {
  jest.resetAllMocks()
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  ;(resolveFallbackPlan as jest.Mock).mockResolvedValue('FREE')
  asRole(TeamRole.OWNER)
})

describe('changeMemberRole', () => {
  it('needs the change-role permission', async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue({
      id: 'm2',
      teamId: TEAM,
      role: TeamRole.MEMBER,
    })
    await admin.changeMemberRole('owner', 'u2', 'ADMIN')
    expect(requireMembership).toHaveBeenCalledWith('owner', {
      permission: TeamPermission.MEMBERS_CHANGE_ROLE,
    })
  })

  it('refuses to change your own role', async () => {
    await expect(
      admin.changeMemberRole('owner', 'owner', 'MEMBER'),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it.each([
    ['no membership row (for example a pending invite)', null],
    ['a member of another workspace', { teamId: 'other-team' }],
  ])('404s for %s', async (_label, row) => {
    mockPrisma.teamMember.findUnique.mockResolvedValue(row)
    await expect(
      admin.changeMemberRole('owner', 'u2', 'ADMIN'),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('never edits the owner role', async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue({
      id: 'm2',
      teamId: TEAM,
      role: TeamRole.OWNER,
    })
    await expect(
      admin.changeMemberRole('owner', 'u2', 'MEMBER'),
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(mockPrisma.teamMember.update).not.toHaveBeenCalled()
  })

  it('is a quiet no-op when the role is already set', async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue({
      id: 'm2',
      teamId: TEAM,
      role: TeamRole.ADMIN,
    })
    await expect(
      admin.changeMemberRole('owner', 'u2', 'ADMIN'),
    ).resolves.toEqual({ userId: 'u2', role: 'ADMIN' })
    expect(mockPrisma.teamMember.update).not.toHaveBeenCalled()
    expect(mockPrisma.teamAuditLog.create).not.toHaveBeenCalled()
  })

  it('updates the role under the team lock and records the change', async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue({
      id: 'm2',
      teamId: TEAM,
      role: TeamRole.MEMBER,
    })
    await admin.changeMemberRole('owner', 'u2', 'ADMIN')

    expect(lockTeamRow).toHaveBeenCalledWith(mockPrisma, TEAM)
    expect(mockPrisma.teamMember.update).toHaveBeenCalledWith({
      where: { id: 'm2' },
      data: { role: 'ADMIN' },
    })
    expect(mockPrisma.teamAuditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'ROLE_CHANGED',
      actorUserId: 'owner',
      targetUserId: 'u2',
      metadata: { from: 'MEMBER', to: 'ADMIN' },
    })
  })
})

describe('transferOwnership', () => {
  const target = (overrides: Record<string, unknown> = {}) => ({
    id: 'm2',
    teamId: TEAM,
    role: TeamRole.ADMIN,
    user: { status: 'ACTIVE' },
    ...overrides,
  })

  it('needs the transfer permission and refuses a self-transfer', async () => {
    await expect(
      admin.transferOwnership('owner', 'owner'),
    ).rejects.toBeInstanceOf(BadRequestError)
    expect(requireMembership).toHaveBeenCalledWith('owner', {
      permission: TeamPermission.OWNERSHIP_TRANSFER,
    })
  })

  it('rejects a pending invite — it has no membership yet', async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue(null)
    await expect(
      admin.transferOwnership('owner', 'invitee'),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(mockPrisma.team.update).not.toHaveBeenCalled()
  })

  it('rejects a member of another workspace', async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue(
      target({ teamId: 'other' }),
    )
    await expect(admin.transferOwnership('owner', 'u2')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it.each(['INACTIVE', 'SUSPENDED', 'DELETED'])(
    'rejects a %s user',
    async (status) => {
      mockPrisma.teamMember.findUnique.mockResolvedValue(
        target({ user: { status } }),
      )
      await expect(
        admin.transferOwnership('owner', 'u2'),
      ).rejects.toBeInstanceOf(BadRequestError)
      expect(mockPrisma.team.update).not.toHaveBeenCalled()
    },
  )

  it('moves the team to the target, makes the old owner an admin and records it', async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue(target())
    await admin.transferOwnership('owner', 'u2')

    expect(lockTeamRow).toHaveBeenCalledWith(mockPrisma, TEAM)
    expect(mockPrisma.team.update).toHaveBeenCalledWith({
      where: { id: TEAM },
      data: { ownerId: 'u2' },
    })
    expect(mockPrisma.teamMember.update).toHaveBeenCalledWith({
      where: { id: 'm2' },
      data: { role: 'OWNER', monthlyCreditLimitPaisa: null },
    })
    expect(mockPrisma.teamMember.update).toHaveBeenCalledWith({
      where: { userId: 'owner' },
      data: { role: 'ADMIN' },
    })
    expect(auditActions()).toEqual(['OWNERSHIP_TRANSFERRED'])
  })
})

describe('leaveTeam', () => {
  it('blocks the owner until ownership is transferred', async () => {
    await expect(admin.leaveTeam('owner')).rejects.toThrow('Transfer ownership')
    expect(detachMember).not.toHaveBeenCalled()
  })

  it.each([TeamRole.ADMIN, TeamRole.MEMBER])(
    'lets a %s leave and records it',
    async (role) => {
      asRole(role)
      mockPrisma.teamMember.findUniqueOrThrow.mockResolvedValue({ id: 'm9' })

      await admin.leaveTeam('u9')

      expect(detachMember).toHaveBeenCalledWith(mockPrisma, 'm9', 'u9')
      expect(
        mockPrisma.teamAuditLog.create.mock.calls[0][0].data,
      ).toMatchObject({
        action: 'MEMBER_LEFT',
        actorUserId: 'u9',
        metadata: { role },
      })
    },
  )
})

describe('invites', () => {
  const invite = (overrides: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    teamId: TEAM,
    email: 'new@fund.com',
    role: TeamRole.MEMBER,
    expiresAt: new Date('2030-01-01'),
    ...overrides,
  })

  it('lists only this workspace’s unexpired invites', async () => {
    mockPrisma.teamInvite.findMany.mockResolvedValue([])
    await admin.listInvites('owner')

    const args = mockPrisma.teamInvite.findMany.mock.calls[0][0]
    expect(args.where.teamId).toBe(TEAM)
    expect(args.where.expiresAt.gt).toBeInstanceOf(Date)
    expect(args.select).not.toHaveProperty('token')
  })

  it('looks invites up by id AND team, so another workspace’s invite is a 404', async () => {
    mockPrisma.teamInvite.findFirst.mockResolvedValue(null)
    await expect(admin.revokeInvite('owner', 'inv-x')).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(mockPrisma.teamInvite.findFirst).toHaveBeenCalledWith({
      where: { id: 'inv-x', teamId: TEAM },
    })
  })

  it('reserves admin invites for the owner', async () => {
    asRole(TeamRole.ADMIN)
    mockPrisma.teamInvite.findFirst.mockResolvedValue(
      invite({ role: TeamRole.ADMIN }),
    )
    await expect(admin.revokeInvite('a', 'inv-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    await expect(admin.resendInvite('a', 'inv-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('revokes an invite and records it', async () => {
    mockPrisma.teamInvite.findFirst.mockResolvedValue(invite())
    await admin.revokeInvite('owner', 'inv-1')

    expect(mockPrisma.teamInvite.delete).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
    })
    expect(auditActions()).toEqual(['INVITE_REVOKED'])
  })

  it('resends with a fresh token, expiry and link, and queues the email', async () => {
    mockPrisma.teamInvite.findFirst.mockResolvedValue(invite())
    mockPrisma.teamInvite.update.mockImplementation(async ({ data }: any) =>
      invite(data),
    )
    ;(dispatchInviteEmail as jest.Mock).mockResolvedValue(true)

    const result = await admin.resendInvite('owner', 'inv-1')

    const data = mockPrisma.teamInvite.update.mock.calls[0][0].data
    expect(data.token).toMatch(/^[0-9a-f]{64}$/)
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(result.inviteLink.startsWith(config.server.frontendUrl)).toBe(true)
    expect(result.inviteLink).toContain('/teams/invite?token=')
    // Only the hash is stored; the raw token is what the link carries.
    expect(result.inviteLink).not.toContain(data.token)
    expect(result).toMatchObject({
      emailQueued: true,
      invite: { id: 'inv-1', email: 'new@fund.com' },
    })
    expect(dispatchInviteEmail).toHaveBeenCalled()
    expect(auditActions()).toEqual(['INVITE_RESENT'])
  })
})

describe('renameTeam', () => {
  it('renames and records it', async () => {
    mockPrisma.team.update.mockResolvedValue({ id: TEAM, name: 'New Name' })
    await expect(admin.renameTeam('owner', 'New Name')).resolves.toEqual({
      id: TEAM,
      name: 'New Name',
    })
    expect(requireMembership).toHaveBeenCalledWith('owner', {
      permission: TeamPermission.SETTINGS_MANAGE,
    })
    expect(auditActions()).toEqual(['TEAM_RENAMED'])
  })
})

describe('deleteTeam', () => {
  beforeEach(() => {
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({ name: 'Alpha Fund' })
    mockPrisma.teamMember.findMany.mockResolvedValue([
      { userId: 'owner', role: TeamRole.OWNER },
      { userId: 'u2', role: TeamRole.MEMBER },
    ])
  })

  it('is owner-only and needs the exact workspace name', async () => {
    await expect(
      admin.deleteTeam('owner', 'alpha fund'),
    ).rejects.toBeInstanceOf(BadRequestError)
    expect(requireMembership).toHaveBeenCalledWith('owner', {
      permission: TeamPermission.TEAM_DELETE,
    })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('cancels, purges assets, hard-deletes every seat and records each removal', async () => {
    await admin.deleteTeam('owner', 'Alpha Fund')

    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 30_000,
    })
    expect(lockTeamRow).toHaveBeenCalledWith(mockPrisma, TEAM)
    expect(mockPrisma.team.update.mock.calls[0][0].data).toMatchObject({
      status: 'CANCELLED',
      billingEmail: null,
      scheduledSeatCapacity: null,
      orgInstructions: null,
    })
    // A deleted workspace can no longer be renewed or revived.
    expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { teamId: TEAM },
      data: { autoRenew: false, status: 'CANCELLED' },
    })
    for (const model of [
      'sharedWatchlist',
      'sharedScreener',
      'sharedResearchNote',
      'teamInvite',
      'teamDomain',
      'teamMember',
    ]) {
      expect(mockPrisma[model].deleteMany).toHaveBeenCalledWith({
        where: { teamId: TEAM },
      })
    }
    // Members fall back to their personal plan.
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(2)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { plan: 'FREE' },
    })
    // History survives only in the audit trail: one entry per member, plus the deletion.
    expect(auditActions()).toEqual([
      'MEMBER_REMOVED',
      'MEMBER_REMOVED',
      'TEAM_DELETED',
    ])
    expect(mockPrisma.teamAuditLog.create.mock.calls[1][0].data).toMatchObject({
      targetUserId: 'u2',
      metadata: { role: 'MEMBER', reason: 'TEAM_DELETED' },
    })
  })
})

describe('updateBillingContact', () => {
  it.each([
    ['sets', 'billing@fund.com', false],
    ['clears', null, true],
  ])(
    '%s the contact and records it without the address',
    async (_l, email, cleared) => {
      mockPrisma.team.update.mockResolvedValue({ billingEmail: email })
      await admin.updateBillingContact('owner', email)

      expect(requireMembership).toHaveBeenCalledWith('owner', {
        permission: TeamPermission.BILLING_MANAGE,
      })
      expect(mockPrisma.team.update.mock.calls[0][0].data).toEqual({
        billingEmail: email,
      })
      const audit = mockPrisma.teamAuditLog.create.mock.calls[0][0].data
      expect(audit.metadata).toEqual({ cleared })
      expect(JSON.stringify(audit)).not.toContain('fund.com')
    },
  )
})

describe('seat reduction', () => {
  const usage = (capacity: number, members: number, pending: number) => {
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
      seatCapacity: capacity,
      scheduledSeatCapacity: null,
    })
    mockPrisma.teamMember.count.mockResolvedValue(members)
    mockPrisma.teamInvite.count.mockResolvedValue(pending)
  }

  it('must go below the current capacity', async () => {
    usage(10, 3, 0)
    await expect(
      admin.scheduleSeatReduction('owner', 10),
    ).rejects.toBeInstanceOf(BadRequestError)
    await expect(
      admin.scheduleSeatReduction('owner', 12),
    ).rejects.toBeInstanceOf(BadRequestError)
  })

  it('cannot go below the seats in use (members plus pending invites)', async () => {
    usage(10, 4, 2)
    await expect(
      admin.scheduleSeatReduction('owner', 5),
    ).rejects.toBeInstanceOf(ConflictError)
    expect(mockPrisma.team.update).not.toHaveBeenCalled()
  })

  it('schedules the reduction under the lock and records it', async () => {
    usage(10, 4, 2)
    await expect(admin.scheduleSeatReduction('owner', 6)).resolves.toEqual({
      seatCapacity: 10,
      scheduledSeatCapacity: 6,
    })
    expect(lockTeamRow).toHaveBeenCalledWith(mockPrisma, TEAM)
    expect(mockPrisma.team.update).toHaveBeenCalledWith({
      where: { id: TEAM },
      data: { scheduledSeatCapacity: 6 },
    })
    expect(mockPrisma.teamAuditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'SEAT_REDUCTION_SCHEDULED',
      metadata: { seatCount: 6 },
    })
  })

  it('cancels a scheduled reduction and records it', async () => {
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
      seatCapacity: 10,
      scheduledSeatCapacity: 6,
    })
    await expect(admin.cancelSeatReduction('owner')).resolves.toEqual({
      seatCapacity: 10,
      scheduledSeatCapacity: null,
    })
    expect(mockPrisma.team.update).toHaveBeenCalledWith({
      where: { id: TEAM },
      data: { scheduledSeatCapacity: null },
    })
    expect(auditActions()).toEqual(['SEAT_REDUCTION_CANCELLED'])
  })

  it('is a quiet no-op when nothing was scheduled', async () => {
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
      seatCapacity: 10,
      scheduledSeatCapacity: null,
    })
    await admin.cancelSeatReduction('owner')
    expect(mockPrisma.team.update).not.toHaveBeenCalled()
    expect(mockPrisma.teamAuditLog.create).not.toHaveBeenCalled()
  })
})

describe('listAuditLog', () => {
  const row = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    action: 'MEMBER_REMOVED',
    actorUserId: 'owner',
    targetUserId: 'u2',
    metadata: { role: 'MEMBER' },
    createdAt: new Date('2030-01-01'),
    ...overrides,
  })

  beforeEach(() => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'owner', displayName: 'Olivia' },
    ])
  })

  it('needs the audit permission and only reads this workspace', async () => {
    mockPrisma.teamAuditLog.findMany.mockResolvedValue([])
    await admin.listAuditLog('owner', { limit: 25 })

    expect(requireMembership).toHaveBeenCalledWith('owner', {
      permission: TeamPermission.AUDIT_READ,
    })
    expect(mockPrisma.teamAuditLog.findMany.mock.calls[0][0].where).toEqual({
      teamId: TEAM,
    })
  })

  it('filters by action', async () => {
    mockPrisma.teamAuditLog.findMany.mockResolvedValue([])
    await admin.listAuditLog('owner', { limit: 25, action: 'ROLE_CHANGED' })
    expect(mockPrisma.teamAuditLog.findMany.mock.calls[0][0].where).toEqual({
      teamId: TEAM,
      action: 'ROLE_CHANGED',
    })
  })

  it('rejects a cursor that is not one of this workspace’s entries', async () => {
    mockPrisma.teamAuditLog.findFirst.mockResolvedValue(null)
    await expect(
      admin.listAuditLog('owner', { limit: 25, cursor: 'foreign' }),
    ).rejects.toBeInstanceOf(BadRequestError)
    expect(mockPrisma.teamAuditLog.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', teamId: TEAM },
      select: { id: true },
    })
    expect(mockPrisma.teamAuditLog.findMany).not.toHaveBeenCalled()
  })

  it('paginates with a cursor and resolves display names (null for unknown users)', async () => {
    mockPrisma.teamAuditLog.findFirst.mockResolvedValue({ id: 'c1' })
    mockPrisma.teamAuditLog.findMany.mockResolvedValue([
      row('a'),
      row('b', { actorUserId: null }),
      row('c'),
    ])

    const page = await admin.listAuditLog('owner', {
      limit: 2,
      cursor: 'c1',
    })

    const args = mockPrisma.teamAuditLog.findMany.mock.calls[0][0]
    expect(args).toMatchObject({
      take: 3,
      cursor: { id: 'c1' },
      skip: 1,
    })
    expect(page.entries).toHaveLength(2)
    expect(page.nextCursor).toBe('b')
    expect(page.entries[0]).toMatchObject({
      actorName: 'Olivia',
      targetName: null,
    })
    expect(page.entries[1].actorName).toBeNull()
  })

  it('has no next cursor on the last page', async () => {
    mockPrisma.teamAuditLog.findMany.mockResolvedValue([row('a')])
    const page = await admin.listAuditLog('owner', { limit: 25 })
    expect(page.nextCursor).toBeNull()
  })
})

describe('exportTeam', () => {
  beforeEach(() => {
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
      id: TEAM,
      name: 'Alpha Fund',
    })
    mockPrisma.teamMember.findMany.mockResolvedValue([
      {
        userId: 'owner',
        role: 'OWNER',
        monthlyCreditLimitPaisa: null,
        createdAt: new Date('2030-01-01'),
        user: { displayName: 'Olivia', email: 'o@fund.com' },
      },
    ])
    for (const model of [
      'teamDomain',
      'sharedWatchlist',
      'sharedScreener',
      'sharedResearchNote',
      'paymentTransaction',
      'teamAuditLog',
    ]) {
      mockPrisma[model].findMany.mockResolvedValue([])
    }
  })

  it('is owner-only', async () => {
    await admin.exportTeam('owner')
    expect(requireMembership).toHaveBeenCalledWith('owner', {
      permission: TeamPermission.TEAM_EXPORT,
    })
  })

  it('caps every section and scopes each query to the workspace', async () => {
    await admin.exportTeam('owner')

    for (const model of [
      'teamMember',
      'sharedWatchlist',
      'sharedScreener',
      'sharedResearchNote',
      'paymentTransaction',
      'teamAuditLog',
    ]) {
      const args = mockPrisma[model].findMany.mock.calls[0][0]
      expect(args.where.teamId).toBe(TEAM)
      expect(args.take).toBe(5000)
    }
  })

  it('exports paid transactions without the raw webhook payload or token, and records the export', async () => {
    const snapshot = await admin.exportTeam('owner')

    const select =
      mockPrisma.paymentTransaction.findMany.mock.calls[0][0].select
    expect(select).not.toHaveProperty('rawWebhookPayload')
    expect(select).not.toHaveProperty('token')
    expect(snapshot.members).toEqual([
      expect.objectContaining({
        userId: 'owner',
        email: 'o@fund.com',
        displayName: 'Olivia',
      }),
    ])
    expect(snapshot.team).toMatchObject({ id: TEAM })
    expect(auditActions()).toEqual(['TEAM_EXPORTED'])
  })
})
