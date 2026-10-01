const mockPrisma: any = {
  user: { findUnique: jest.fn() },
  paymentTransaction: { findMany: jest.fn() },
  creditLedger: { findMany: jest.fn() },
  userSession: { findMany: jest.fn() },
  teamAuditLog: { findMany: jest.fn() },
  adminAuditLog: { findMany: jest.fn(), create: jest.fn() },
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

import { NotFoundError } from '../../../shared/errors'
import { getUserTimeline } from '../timeline-service'

const USER = '0191e4a0-0000-7000-8000-0000000000bb'
const ctx = { adminId: 'staff-1', ipAddress: '10.0.0.7' }
const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 10, minute))

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.user.findUnique.mockResolvedValue({ id: USER })
  mockPrisma.adminAuditLog.create.mockResolvedValue({})
  for (const source of [
    mockPrisma.paymentTransaction,
    mockPrisma.creditLedger,
    mockPrisma.userSession,
    mockPrisma.teamAuditLog,
    mockPrisma.adminAuditLog,
  ]) {
    source.findMany.mockResolvedValue([])
  }
})

describe('getUserTimeline', () => {
  it('merges every source newest-first with readable titles', async () => {
    mockPrisma.paymentTransaction.findMany.mockResolvedValue([
      {
        id: 'pay1',
        kind: 'SEAT_ADDITION',
        status: 'COMPLETED',
        planTier: 'TEAM',
        amountPaisa: 749900,
        createdAt: at(5),
      },
    ])
    mockPrisma.creditLedger.findMany.mockResolvedValue([
      {
        id: 'led1',
        type: 'MANUAL_ADJUSTMENT',
        amountPaisa: 5000,
        description: 'Manual adjustment by staff: sent to jane@example.com',
        createdAt: at(4),
      },
    ])
    mockPrisma.userSession.findMany.mockResolvedValue([
      { id: 'ses1', isRevoked: true, createdAt: at(1) },
      { id: 'ses2', isRevoked: false, createdAt: at(9) },
    ])
    mockPrisma.teamAuditLog.findMany.mockResolvedValue([
      {
        id: 'tm1',
        action: 'MEMBER_REMOVED',
        teamId: 'team-1',
        createdAt: at(3),
      },
    ])
    mockPrisma.adminAuditLog.findMany.mockResolvedValue([
      {
        id: 'adm1',
        action: 'PLAN_OVERRIDE',
        reason: 'Enterprise pilot approved',
        ticketRef: 'SUP-77',
        createdAt: at(7),
        admin: { displayName: 'Ada Admin' },
      },
    ])

    const { items, nextBefore } = await getUserTimeline(ctx, USER, {
      limit: 50,
    })

    expect(items.map((event) => event.id)).toEqual([
      'ses2',
      'adm1',
      'pay1',
      'led1',
      'tm1',
      'ses1',
    ])
    expect(nextBefore).toBeNull()
    expect(items[1]).toMatchObject({
      type: 'STAFF_ACTION',
      title: 'Staff: Plan override',
      ticketRef: 'SUP-77',
    })
    expect(items[2]).toMatchObject({
      type: 'PAYMENT',
      title: 'Seat addition payment completed',
    })
    expect(items[5].title).toBe('Signed in (since revoked)')
  })

  it('redacts emails that slipped into ledger descriptions and carries no IPs', async () => {
    mockPrisma.creditLedger.findMany.mockResolvedValue([
      {
        id: 'led1',
        type: 'MANUAL_ADJUSTMENT',
        amountPaisa: 5000,
        description: 'refund to jane@example.com',
        createdAt: at(4),
      },
    ])
    const { items } = await getUserTimeline(ctx, USER, { limit: 50 })
    expect(items[0].detail).not.toContain('jane@example.com')
    expect(JSON.stringify(items)).not.toContain('10.0.0.7')
  })

  it('pages: returns a cursor when older events remain, and filters by it', async () => {
    mockPrisma.userSession.findMany.mockResolvedValue([
      { id: 's3', isRevoked: false, createdAt: at(30) },
      { id: 's2', isRevoked: false, createdAt: at(20) },
      { id: 's1', isRevoked: false, createdAt: at(10) },
    ])

    const first = await getUserTimeline(ctx, USER, { limit: 2 })
    expect(first.items.map((event) => event.id)).toEqual(['s3', 's2'])
    expect(first.nextBefore).toBe(at(20).toISOString())

    await getUserTimeline(ctx, USER, { limit: 2, before: at(20) })
    expect(mockPrisma.userSession.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { userId: USER, createdAt: { lt: at(20) } },
        take: 3,
      }),
    )
  })

  it('queries every source for this user only', async () => {
    await getUserTimeline(ctx, USER, { limit: 10 })
    expect(mockPrisma.paymentTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER, createdAt: undefined },
      }),
    )
    expect(mockPrisma.creditLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER, createdAt: undefined },
      }),
    )
    expect(mockPrisma.teamAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ targetUserId: USER }, { actorUserId: USER }],
          createdAt: undefined,
        },
      }),
    )
    expect(mockPrisma.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { targetId: USER, createdAt: undefined },
      }),
    )
  })

  it('records the read, and fails closed if it cannot', async () => {
    await getUserTimeline(ctx, USER, { limit: 10 })
    expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.adminAuditLog.create.mock.calls[0][0].data).toMatchObject(
      {
        adminId: 'staff-1',
        action: 'CUSTOMER_DATA_VIEWED',
        targetType: 'USER',
        metadata: expect.objectContaining({ resultIds: [USER] }),
      },
    )

    mockPrisma.adminAuditLog.create.mockRejectedValueOnce(new Error('db down'))
    await expect(getUserTimeline(ctx, USER, { limit: 10 })).rejects.toThrow(
      'db down',
    )
  })

  it('404s for an unknown user without reading anything else', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    await expect(
      getUserTimeline(ctx, USER, { limit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(mockPrisma.paymentTransaction.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.adminAuditLog.create).not.toHaveBeenCalled()
  })
})
