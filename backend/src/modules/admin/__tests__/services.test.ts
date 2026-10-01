/**
 * Audit + business-rule tests for the admin write services. Each write must
 * append exactly one AdminAuditLog row inside its transaction, and a rejected
 * write must append none.
 */
const mockTx: any = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  team: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  teamMember: {
    findUnique: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  },
  teamInvite: { count: jest.fn() },
  teamDomain: { findUnique: jest.fn(), update: jest.fn() },
  teamAuditLog: { create: jest.fn() },
  subscription: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  userSession: { updateMany: jest.fn() },
  creditLedger: { create: jest.fn() },
  adminAuditLog: { create: jest.fn() },
}

const mockPrisma: any = {
  ...mockTx,
  paymentTransaction: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  adminAuditLog: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(mockTx)),
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  ...jest.requireActual('../../../shared/infrastructure/team-access'),
  resolveFallbackPlan: jest.fn().mockResolvedValue('FREE'),
}))

const mockReplay = jest.fn()
const mockSubscriptionQueues = jest.fn()
jest.mock('../../payments/public', () => ({
  TEAM_MIN_SEATS: 2,
  replayStoredWebhook: (...args: unknown[]) => mockReplay(...args),
  getSubscriptionQueues: () => mockSubscriptionQueues(),
}))

const mockEmailQueue = jest.fn()
const mockAuthEmailQueue = jest.fn()
jest.mock('../../notifications/public', () => ({
  getEmailQueue: () => mockEmailQueue(),
  getAuthEmailQueue: () => mockAuthEmailQueue(),
}))

const mockMarket = { closed: false }
const mockPersistEmergency = jest.fn()
jest.mock('../../../shared/infrastructure/emergency-sync', () => ({
  persistEmergencyClosed: (...args: unknown[]) => mockPersistEmergency(...args),
}))

jest.mock('../../../shared/utils/market-hours', () => ({
  isEmergencyClosed: () => mockMarket.closed,
  setEmergencyClosed: (value: boolean) => {
    mockMarket.closed = value
  },
}))

import {
  AdminAuditAction,
  CreditLedgerType,
  PaymentStatus,
  PlanTier,
  SubscriptionStatus,
  TeamRole,
} from '@prisma/client'
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../../shared/errors'
import { AdminCreditTarget } from '../constants'
import * as Billing from '../billing-service'
import * as System from '../system-service'
import * as Teams from '../teams-service'
import * as Telemetry from '../telemetry-service'
import * as Users from '../users-service'
import config from '@/config'

const ADMIN = '0191e4a0-0000-7000-8000-0000000000aa'
const TARGET = '0191e4a0-0000-7000-8000-0000000000bb'
const TEAM = '0191e4a0-0000-7000-8000-0000000000cc'
const ctx = {
  adminId: ADMIN,
  reason: 'Approved by finance, ticket 4821',
  ticketRef: 'SUP-4821',
  ipAddress: '10.0.0.7',
}

const readCtx = { adminId: ADMIN, ipAddress: ctx.ipAddress }

/** Staff reads of customer data are audited on the plain client (no mutation to join). */
const expectReadAudit = (targetType: string, resultIds: string[], call = 0) => {
  const { data } = mockPrisma.adminAuditLog.create.mock.calls[call][0]
  expect(data).toMatchObject({
    adminId: ADMIN,
    action: AdminAuditAction.CUSTOMER_DATA_VIEWED,
    targetType,
    targetId: 'SEARCH',
    ipAddress: ctx.ipAddress,
  })
  expect(data.metadata.resultIds).toEqual(resultIds)
  return data
}

const expectOneAudit = (
  action: AdminAuditAction,
  targetType: string,
  targetId: string,
) => {
  expect(mockTx.adminAuditLog.create).toHaveBeenCalledTimes(1)
  const { data } = mockTx.adminAuditLog.create.mock.calls[0][0]
  expect(data).toMatchObject({
    adminId: ADMIN,
    action,
    targetType,
    targetId,
    reason: ctx.reason,
    ticketRef: 'SUP-4821',
    ipAddress: ctx.ipAddress,
  })
  return data
}

beforeEach(() => {
  jest.clearAllMocks()
  mockMarket.closed = false
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(mockTx),
  )
  mockPrisma.adminAuditLog.create.mockResolvedValue({})
})

describe('users', () => {
  it('searches by id/email/name and reports active sessions', async () => {
    mockPrisma.user.findMany = jest.fn().mockResolvedValue([
      {
        id: TARGET,
        plan: 'PRO',
        teamMembers: [{ teamId: TEAM, role: 'MEMBER' }],
        _count: { userSessions: 3 },
      },
    ])
    const [row] = await Users.searchUsers(readCtx, TARGET, 10)
    expect(row).toMatchObject({ activeSessions: 3, team: { teamId: TEAM } })
    const where = mockPrisma.user.findMany.mock.calls[0][0].where
    expect(where.OR).toHaveLength(3)
    expectReadAudit('USER', [TARGET])

    await Users.searchUsers(readCtx, 'ali', 10)
    expect(mockPrisma.user.findMany.mock.calls[1][0].where.OR).toHaveLength(2)
  })

  it('overrides a plan and audits once', async () => {
    mockTx.user.findUnique.mockResolvedValue({ id: TARGET, plan: 'FREE' })
    mockTx.teamMember.findUnique.mockResolvedValue(null)
    mockTx.subscription.updateMany.mockResolvedValue({ count: 0 })

    const result = await Users.overridePlan(ctx, TARGET, PlanTier.PRO)

    expect(result).toMatchObject({ previousPlan: 'FREE', plan: 'PRO' })
    expect(mockTx.user.update).toHaveBeenCalledWith({
      where: { id: TARGET },
      data: { plan: 'PRO' },
    })
    expect(mockTx.subscription.updateMany).not.toHaveBeenCalled()
    const data = expectOneAudit(AdminAuditAction.PLAN_OVERRIDE, 'USER', TARGET)
    expect(data.metadata).toMatchObject({ fromPlan: 'FREE', toPlan: 'PRO' })
  })

  it('cancels a live personal subscription when moving off PRO', async () => {
    mockTx.user.findUnique.mockResolvedValue({ id: TARGET, plan: 'PRO' })
    mockTx.teamMember.findUnique.mockResolvedValue(null)
    mockTx.subscription.updateMany.mockResolvedValue({ count: 1 })

    await Users.overridePlan(ctx, TARGET, PlanTier.FREE)

    expect(mockTx.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: SubscriptionStatus.CANCELLED, autoRenew: false },
      }),
    )
    expect(
      expectOneAudit(AdminAuditAction.PLAN_OVERRIDE, 'USER', TARGET).metadata,
    ).toMatchObject({ cancelledSubscription: true })
  })

  it('removes a non-owner member when downgrading TEAM -> PRO', async () => {
    mockTx.user.findUnique.mockResolvedValue({ id: TARGET, plan: 'TEAM' })
    mockTx.teamMember.findUnique.mockResolvedValue({
      id: 'm1',
      teamId: TEAM,
      userId: TARGET,
      role: TeamRole.MEMBER,
    })
    mockTx.subscription.updateMany.mockResolvedValue({ count: 0 })

    const result = await Users.overridePlan(ctx, TARGET, PlanTier.PRO)

    expect(mockTx.teamMember.delete).toHaveBeenCalledWith({
      where: { id: 'm1' },
    })
    expect(result.detachedFromTeamId).toBe(TEAM)
    expect(mockTx.teamAuditLog.create).toHaveBeenCalledTimes(1)
    expectOneAudit(AdminAuditAction.PLAN_OVERRIDE, 'USER', TARGET)
  })

  it('refuses to downgrade a workspace owner and writes nothing', async () => {
    mockTx.user.findUnique.mockResolvedValue({ id: TARGET, plan: 'TEAM' })
    mockTx.teamMember.findUnique.mockResolvedValue({
      id: 'm1',
      teamId: TEAM,
      userId: TARGET,
      role: TeamRole.OWNER,
    })

    await expect(
      Users.overridePlan(ctx, TARGET, PlanTier.FREE),
    ).rejects.toBeInstanceOf(ConflictError)
    expect(mockTx.user.update).not.toHaveBeenCalled()
    expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled()
  })

  it('404s plan override and session invalidation for unknown users', async () => {
    mockTx.user.findUnique.mockResolvedValue(null)
    await expect(
      Users.overridePlan(ctx, TARGET, PlanTier.PRO),
    ).rejects.toBeInstanceOf(NotFoundError)
    await expect(Users.invalidateSessions(ctx, TARGET)).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled()
  })

  it('revokes sessions and audits the count', async () => {
    mockTx.user.findUnique.mockResolvedValue({ id: TARGET })
    mockTx.userSession.updateMany.mockResolvedValue({ count: 4 })

    const result = await Users.invalidateSessions(ctx, TARGET)

    expect(result.revokedSessions).toBe(4)
    expect(mockTx.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: TARGET, isRevoked: false },
      data: { isRevoked: true },
    })
    expect(
      expectOneAudit(AdminAuditAction.USER_SESSION_INVALIDATED, 'USER', TARGET)
        .metadata,
    ).toEqual({ revokedSessions: 4 })
  })
})

describe('teams', () => {
  it('searches teams with seat utilization', async () => {
    mockPrisma.team.findMany = jest.fn().mockResolvedValue([
      {
        id: TEAM,
        seatCapacity: 10,
        scheduledSeatCapacity: null,
        members: new Array(8).fill({}),
      },
    ])
    const [row] = await Teams.searchTeams(readCtx, TEAM, 5)
    expect(row.seatUtilization).toBe('8/10')
    expectReadAudit('TEAM', [TEAM])
    expect(mockPrisma.team.findMany.mock.calls[0][0].where.OR).toHaveLength(3)
  })

  it('overrides capacity, clears the scheduled reduction and audits', async () => {
    mockTx.team.findUnique.mockResolvedValue({
      id: TEAM,
      seatCapacity: 150,
      scheduledSeatCapacity: 40,
    })
    mockTx.teamMember.count.mockResolvedValue(30)
    mockTx.teamInvite.count.mockResolvedValue(5)

    const result = await Teams.setSeatCapacity(ctx, TEAM, 400)

    expect(mockTx.team.update).toHaveBeenCalledWith({
      where: { id: TEAM },
      data: { seatCapacity: 400, scheduledSeatCapacity: null },
    })
    expect(result.scheduledSeatCapacity).toBeNull()
    expect(
      expectOneAudit(AdminAuditAction.SEAT_CAPACITY_OVERRIDE, 'TEAM', TEAM)
        .metadata,
    ).toMatchObject({
      previousCapacity: 150,
      newCapacity: 400,
      clearedScheduledCapacity: 40,
    })
  })

  it('rejects a capacity below members + pending invites', async () => {
    mockTx.team.findUnique.mockResolvedValue({
      id: TEAM,
      seatCapacity: 150,
      scheduledSeatCapacity: null,
    })
    mockTx.teamMember.count.mockResolvedValue(30)
    mockTx.teamInvite.count.mockResolvedValue(5)

    await expect(Teams.setSeatCapacity(ctx, TEAM, 34)).rejects.toBeInstanceOf(
      BadRequestError,
    )
    expect(mockTx.team.update).not.toHaveBeenCalled()
    expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled()
  })

  it('404s capacity override for an unknown team', async () => {
    mockTx.team.findUnique.mockResolvedValue(null)
    await expect(Teams.setSeatCapacity(ctx, TEAM, 400)).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('force-verifies a domain and audits', async () => {
    mockTx.teamDomain.findUnique.mockResolvedValue({
      id: 'd1',
      teamId: TEAM,
      domain: 'acme.com',
      isVerified: false,
    })

    await Teams.forceVerifyDomain(ctx, 'd1')

    expect(mockTx.teamDomain.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { isVerified: true },
    })
    expectOneAudit(AdminAuditAction.DOMAIN_FORCE_VERIFIED, 'TEAM_DOMAIN', 'd1')
  })

  it('rejects verifying a missing or already verified domain', async () => {
    mockTx.teamDomain.findUnique.mockResolvedValueOnce(null)
    await expect(Teams.forceVerifyDomain(ctx, 'd1')).rejects.toBeInstanceOf(
      NotFoundError,
    )
    mockTx.teamDomain.findUnique.mockResolvedValueOnce({ isVerified: true })
    await expect(Teams.forceVerifyDomain(ctx, 'd1')).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled()
  })

  it('hard-removes a member, frees the seat and audits', async () => {
    mockTx.teamMember.findUnique.mockResolvedValue({
      id: 'm1',
      teamId: TEAM,
      userId: TARGET,
      role: TeamRole.MEMBER,
    })

    await Teams.forceRemoveMember(ctx, TARGET)

    expect(mockTx.teamMember.delete).toHaveBeenCalledWith({
      where: { id: 'm1' },
    })
    expect(mockTx.user.update).toHaveBeenCalledWith({
      where: { id: TARGET },
      data: { plan: 'FREE' },
    })
    expectOneAudit(AdminAuditAction.MEMBER_FORCE_REMOVED, 'USER', TARGET)
  })

  it('refuses to remove an owner or a non-member', async () => {
    mockTx.teamMember.findUnique.mockResolvedValueOnce({ role: TeamRole.OWNER })
    await expect(Teams.forceRemoveMember(ctx, TARGET)).rejects.toBeInstanceOf(
      ConflictError,
    )
    mockTx.teamMember.findUnique.mockResolvedValueOnce(null)
    await expect(Teams.forceRemoveMember(ctx, TARGET)).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(mockTx.teamMember.delete).not.toHaveBeenCalled()
    expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled()
  })
})

describe('billing', () => {
  it('lists webhooks with derived signature state and filters', async () => {
    mockPrisma.paymentTransaction.count.mockResolvedValue(2)
    mockPrisma.paymentTransaction.findMany.mockResolvedValue([
      { id: 'a', rawWebhookPayload: { data: {} } },
      { id: 'b', rawWebhookPayload: null },
    ])

    const page = await Billing.listWebhooks(readCtx, {
      page: 2,
      limit: 10,
      status: PaymentStatus.PENDING,
      trackerId: 'trk',
      from: new Date('2026-01-01'),
    })

    expect(page.total).toBe(2)
    const audited = expectReadAudit('PAYMENT', ['a', 'b'])
    expect(audited.metadata.filterKeys).toEqual(
      expect.arrayContaining(['status', 'trackerId', 'from']),
    )
    expect(audited.metadata.filterKeys).not.toContain('page')
    expect(page.items[0]).toMatchObject({ signatureVerified: true })
    expect(page.items[1]).toMatchObject({
      webhookReceived: false,
      signatureVerified: false,
    })
    expect(mockPrisma.paymentTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    )

    await Billing.listWebhooks(readCtx, { page: 1, limit: 10 })
    expect(
      mockPrisma.paymentTransaction.findMany.mock.calls[1][0].where,
    ).toEqual({})
  })

  it('retries a webhook and audits before/after status', async () => {
    mockPrisma.paymentTransaction.findUnique.mockResolvedValue({
      status: PaymentStatus.PENDING,
    })
    mockReplay.mockResolvedValue({
      trackerId: 'trk',
      status: PaymentStatus.COMPLETED,
    })

    const result = await Billing.retryWebhook(ctx, 'tx1')

    expect(result.status).toBe(PaymentStatus.COMPLETED)
    expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.adminAuditLog.create.mock.calls[0][0].data).toMatchObject(
      {
        action: AdminAuditAction.WEBHOOK_RETRIED,
        targetType: 'PAYMENT',
        targetId: 'tx1',
        metadata: { statusBefore: 'PENDING', statusAfter: 'COMPLETED' },
      },
    )
  })

  it('does not audit when the retry is rejected or the transaction is missing', async () => {
    mockPrisma.paymentTransaction.findUnique.mockResolvedValueOnce(null)
    await expect(Billing.retryWebhook(ctx, 'tx1')).rejects.toBeInstanceOf(
      NotFoundError,
    )
    mockPrisma.paymentTransaction.findUnique.mockResolvedValueOnce({
      status: 'PENDING',
    })
    mockReplay.mockRejectedValueOnce(new ConflictError('No stored payload'))
    await expect(Billing.retryWebhook(ctx, 'tx1')).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(mockPrisma.adminAuditLog.create).not.toHaveBeenCalled()
  })

  it('injects credits into a user pool with a MANUAL_ADJUSTMENT ledger row', async () => {
    mockTx.user.updateMany.mockResolvedValue({ count: 1 })
    mockTx.user.findUnique.mockResolvedValue({ creditBalanceInPaisa: 15_000 })

    const result = await Billing.adjustCredits(ctx, {
      target: AdminCreditTarget.USER,
      targetId: TARGET,
      amountPaisa: 5_000,
    })

    expect(result.balanceInPaisa).toBe(15_000)
    expect(mockTx.user.updateMany).toHaveBeenCalledWith({
      where: { id: TARGET },
      data: { creditBalanceInPaisa: { increment: 5_000 } },
    })
    expect(mockTx.creditLedger.create.mock.calls[0][0].data).toMatchObject({
      userId: TARGET,
      amountPaisa: 5_000,
      type: CreditLedgerType.MANUAL_ADJUSTMENT,
    })
    expect(
      expectOneAudit(AdminAuditAction.CREDIT_INJECTION, 'USER', TARGET)
        .metadata,
    ).toEqual({ amountPaisa: 5_000, target: 'USER' })
  })

  it('deducts from a team pool guarded against going negative', async () => {
    mockTx.team.updateMany.mockResolvedValue({ count: 1 })
    mockTx.team.findUnique.mockResolvedValue({ creditBalanceInPaisa: 100 })

    await Billing.adjustCredits(ctx, {
      target: AdminCreditTarget.TEAM,
      targetId: TEAM,
      amountPaisa: -400,
    })

    expect(mockTx.team.updateMany).toHaveBeenCalledWith({
      where: { id: TEAM, creditBalanceInPaisa: { gte: 400 } },
      data: { creditBalanceInPaisa: { increment: -400 } },
    })
    expect(mockTx.creditLedger.create.mock.calls[0][0].data).toMatchObject({
      teamId: TEAM,
      amountPaisa: -400,
    })
    expectOneAudit(AdminAuditAction.CREDIT_INJECTION, 'TEAM', TEAM)
  })

  it('rejects an overdraft and an unknown target without writing', async () => {
    mockTx.user.updateMany.mockResolvedValue({ count: 0 })
    mockTx.user.findUnique.mockResolvedValueOnce({ creditBalanceInPaisa: 10 })
    await expect(
      Billing.adjustCredits(ctx, {
        target: AdminCreditTarget.USER,
        targetId: TARGET,
        amountPaisa: -500,
      }),
    ).rejects.toBeInstanceOf(BadRequestError)

    mockTx.team.updateMany.mockResolvedValue({ count: 0 })
    mockTx.team.findUnique.mockResolvedValueOnce(null)
    await expect(
      Billing.adjustCredits(ctx, {
        target: AdminCreditTarget.TEAM,
        targetId: TEAM,
        amountPaisa: 500,
      }),
    ).rejects.toBeInstanceOf(NotFoundError)

    expect(mockTx.creditLedger.create).not.toHaveBeenCalled()
    expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled()
  })

  describe('extendSubscription', () => {
    const base = {
      id: 'sub1',
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date('2026-01-01'),
      currentPeriodEnd: new Date('2026-02-01'),
      gracePeriodEnd: null,
    }

    it('extends the period and audits old/new values', async () => {
      mockTx.subscription.findUnique.mockResolvedValue(base)
      const next = new Date('2099-03-01')

      const result = await Billing.extendSubscription(ctx, 'sub1', {
        currentPeriodEnd: next,
      })

      expect(result.currentPeriodEnd).toEqual(next)
      expect(mockTx.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub1' },
        data: { currentPeriodEnd: next, gracePeriodEnd: null },
      })
      expect(
        expectOneAudit(
          AdminAuditAction.SUBSCRIPTION_EXTENDED,
          'SUBSCRIPTION',
          'sub1',
        ).metadata,
      ).toMatchObject({
        previousPeriodEnd: '2026-02-01T00:00:00.000Z',
        newPeriodEnd: next.toISOString(),
        reactivated: false,
      })
    })

    it('reactivates a GRACE subscription whose period moves into the future', async () => {
      mockTx.subscription.findUnique.mockResolvedValue({
        ...base,
        status: SubscriptionStatus.GRACE,
        gracePeriodEnd: new Date('2026-02-04'),
      })

      const result = await Billing.extendSubscription(ctx, 'sub1', {
        currentPeriodEnd: new Date('2099-03-01'),
      })

      expect(result.status).toBe(SubscriptionStatus.ACTIVE)
      expect(result.gracePeriodEnd).toBeNull()
    })

    it('sets only the grace end when asked', async () => {
      mockTx.subscription.findUnique.mockResolvedValue({
        ...base,
        status: SubscriptionStatus.GRACE,
      })
      const grace = new Date('2026-03-01')
      const result = await Billing.extendSubscription(ctx, 'sub1', {
        gracePeriodEnd: grace,
      })
      expect(result.gracePeriodEnd).toEqual(grace)
    })

    it.each([
      ['missing', null, NotFoundError],
      [
        'cancelled',
        { ...base, status: SubscriptionStatus.CANCELLED },
        ConflictError,
      ],
      [
        'expired',
        { ...base, status: SubscriptionStatus.EXPIRED },
        ConflictError,
      ],
    ])('rejects a %s subscription', async (_label, row, error) => {
      mockTx.subscription.findUnique.mockResolvedValue(row)
      await expect(
        Billing.extendSubscription(ctx, 'sub1', {
          currentPeriodEnd: new Date('2099-01-01'),
        }),
      ).rejects.toBeInstanceOf(error)
      expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled()
    })

    it('rejects inconsistent dates', async () => {
      mockTx.subscription.findUnique.mockResolvedValue(base)
      await expect(
        Billing.extendSubscription(ctx, 'sub1', {
          currentPeriodEnd: new Date('2025-12-01'),
        }),
      ).rejects.toBeInstanceOf(BadRequestError)
      await expect(
        Billing.extendSubscription(ctx, 'sub1', {
          gracePeriodEnd: new Date('2026-01-15'),
        }),
      ).rejects.toBeInstanceOf(BadRequestError)
      expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled()
    })
  })
})

describe('credit ledger search', () => {
  const row = (id: string, description: string) => ({
    id,
    userId: TARGET,
    teamId: null,
    amountPaisa: -400,
    type: 'OVERAGE_CONSUMPTION',
    description,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
  })

  it('filters, paginates, scrubs descriptions and audits the read', async () => {
    mockPrisma.creditLedger = {
      count: jest.fn().mockResolvedValue(2),
      findMany: jest
        .fn()
        .mockResolvedValue([
          row('l1', 'forecast for jane@example.com'),
          row('l2', 'ok'),
        ]),
    }

    const result = await Billing.listCreditLedger(readCtx, {
      page: 3,
      limit: 5,
      userId: TARGET,
      type: 'OVERAGE_CONSUMPTION' as never,
    })

    expect(result).toMatchObject({ total: 2, page: 3, limit: 5 })
    expect(result.items[0].description).not.toContain('jane@example.com')
    expect(mockPrisma.creditLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 5,
        where: { userId: TARGET, type: 'OVERAGE_CONSUMPTION' },
      }),
    )
    const audited = expectReadAudit('CREDIT_LEDGER', ['l1', 'l2'])
    expect(audited.metadata.filterKeys).toEqual(
      expect.arrayContaining(['userId', 'type']),
    )
    expect(audited.metadata.filterKeys).not.toContain('page')
  })

  it('searches the whole ledger when no filter is given', async () => {
    mockPrisma.creditLedger = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    }
    await Billing.listCreditLedger(readCtx, { page: 1, limit: 10 })
    expect(mockPrisma.creditLedger.findMany.mock.calls[0][0].where).toEqual({})
  })
})

describe('telemetry', () => {
  it('reports queue health, failures (redacted) and missing Redis', async () => {
    const queue = (name: string) => ({
      name,
      getJobCounts: jest.fn().mockResolvedValue({ active: 1, failed: 2 }),
      getFailed: jest.fn().mockResolvedValue([
        {
          id: '9',
          name: 'send',
          attemptsMade: 3,
          failedReason: 'SMTP 550 <user@example.com> rejected',
          finishedOn: 1_700_000_000_000,
        },
        { name: 'send', attemptsMade: 1 },
      ]),
    })
    mockEmailQueue.mockReturnValue(queue('alert-email'))
    mockAuthEmailQueue.mockReturnValue(null)
    mockSubscriptionQueues.mockReturnValue([queue('subscription-expiry')])

    const health: any[] = await Telemetry.getQueueHealth()

    expect(health.map((q) => q.name)).toEqual([
      'alert-email',
      'auth-email',
      'subscription-expiry',
    ])
    expect(health[1].available).toBe(false)
    expect(health[0].counts).toEqual({ active: 1, failed: 2 })
    expect(health[0].recentFailures[0].failedReason).toBe(
      'SMTP 550 <[redacted-email]> rejected',
    )
    expect(health[0].recentFailures[1]).toMatchObject({
      id: null,
      failedAt: null,
    })
  })
})

describe('read auditing is fail-closed', () => {
  it('does not return customer data when the read cannot be recorded', async () => {
    mockPrisma.user.findMany = jest
      .fn()
      .mockResolvedValue([
        { id: TARGET, _count: { userSessions: 0 }, teamMembers: [] },
      ])
    mockPrisma.adminAuditLog.create.mockRejectedValueOnce(new Error('db down'))
    await expect(Users.searchUsers(readCtx, 'ali', 10)).rejects.toThrow(
      'db down',
    )
  })
})

describe('system', () => {
  it('toggles the market emergency flag and audits first', async () => {
    mockPersistEmergency.mockResolvedValue(true)
    const result = await System.setMarketEmergency(ctx, true)

    expect(mockPersistEmergency).toHaveBeenCalledWith(true)
    expect(result).toEqual({
      emergencyClosed: true,
      previous: false,
      sharedAcrossInstances: true,
    })
    expect(System.getMarketStatus()).toEqual({ emergencyClosed: true })
    expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.adminAuditLog.create.mock.calls[0][0].data).toMatchObject(
      {
        action: AdminAuditAction.EMERGENCY_MARKET_TOGGLED,
        targetType: 'SYSTEM',
        metadata: { previous: false, closed: true },
      },
    )
  })

  it('still halts this instance and says so when Redis cannot share it', async () => {
    mockPersistEmergency.mockResolvedValue(false)
    const result = await System.setMarketEmergency(ctx, true)
    expect(result.sharedAcrossInstances).toBe(false)
    expect(mockMarket.closed).toBe(true)
  })

  it('does not flip the flag when the audit write fails', async () => {
    mockPrisma.adminAuditLog.create.mockRejectedValueOnce(new Error('db down'))
    await expect(System.setMarketEmergency(ctx, true)).rejects.toThrow(
      'db down',
    )
    expect(mockMarket.closed).toBe(false)
  })

  it('paginates and filters audit logs', async () => {
    mockPrisma.adminAuditLog.count.mockResolvedValue(1)
    mockPrisma.adminAuditLog.findMany.mockResolvedValue([{ id: 'l1' }])

    const result = await System.listAuditLogs({
      page: 2,
      limit: 20,
      adminId: ADMIN,
      action: AdminAuditAction.PLAN_OVERRIDE,
      targetType: 'USER',
      targetId: TARGET,
      ticketRef: 'SUP-4821',
    })

    expect(result.total).toBe(1)
    expect(mockPrisma.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        where: {
          adminId: ADMIN,
          action: 'PLAN_OVERRIDE',
          targetType: 'USER',
          targetId: TARGET,
          ticketRef: 'SUP-4821',
        },
      }),
    )
    await System.listAuditLogs({ page: 1, limit: 20 })
    expect(mockPrisma.adminAuditLog.findMany.mock.calls[1][0].where).toEqual({})
  })
})

describe('PII masking and reveal', () => {
  const setMasking = (value: boolean) => {
    ;(config.admin as { maskCustomerPii: boolean }).maskCustomerPii = value
  }
  const original = config.admin.maskCustomerPii
  beforeEach(() => setMasking(true))
  afterEach(() => setMasking(original))

  it('masks customer identity in user search and flags it', async () => {
    mockPrisma.user.findMany = jest.fn().mockResolvedValue([
      {
        id: TARGET,
        email: 'sam@fund.com',
        displayName: 'Sam Lee',
        teamMembers: [],
        _count: { userSessions: 0 },
      },
    ])
    const [row] = await Users.searchUsers(readCtx, 'sam', 10)
    expect(row).toMatchObject({
      email: 's***@f***.com',
      displayName: 'S*** L***',
      piiMasked: true,
    })
  })

  it('masks the owner and members of a searched team', async () => {
    mockPrisma.team.findMany = jest.fn().mockResolvedValue([
      {
        id: TEAM,
        seatCapacity: 5,
        scheduledSeatCapacity: null,
        owner: {
          id: 'o1',
          email: 'owner@fund.com',
          displayName: 'Olive Owner',
        },
        members: [
          {
            role: 'MEMBER',
            user: {
              id: 'm1',
              email: 'mia@fund.com',
              displayName: 'Mia Member',
            },
          },
        ],
      },
    ])
    const [team] = await Teams.searchTeams(readCtx, 'fund', 5)
    expect(team.piiMasked).toBe(true)
    expect(team.owner.email).toBe('o***@f***.com')
    expect(team.members[0].user).toMatchObject({
      email: 'm***@f***.com',
      displayName: 'M*** M***',
    })
  })

  it('scrubs customer details out of stored webhook payloads', async () => {
    mockPrisma.paymentTransaction.count.mockResolvedValue(1)
    mockPrisma.paymentTransaction.findMany.mockResolvedValue([
      { id: 'a', rawWebhookPayload: { customer: 'jane@example.com' } },
    ])
    const page = await Billing.listWebhooks(readCtx, { page: 1, limit: 10 })
    expect(JSON.stringify(page.items[0].payload)).not.toContain(
      'jane@example.com',
    )
  })

  it('reveals the real identifiers and records exactly which fields', async () => {
    mockTx.user.findUnique.mockResolvedValue({
      id: TARGET,
      email: 'sam@fund.com',
      displayName: 'Sam Lee',
      phoneNumber: '+923001234567',
    })

    const user = await Users.revealUser(ctx, TARGET)

    expect(user).toMatchObject({
      email: 'sam@fund.com',
      phoneNumber: '+923001234567',
    })
    expect(
      expectOneAudit(AdminAuditAction.CUSTOMER_DATA_REVEALED, 'USER', TARGET)
        .metadata,
    ).toEqual({ fields: ['email', 'displayName', 'phoneNumber'] })
  })

  it('reveals nothing and audits nothing for an unknown user', async () => {
    mockTx.user.findUnique.mockResolvedValue(null)
    await expect(Users.revealUser(ctx, TARGET)).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled()
  })
})
