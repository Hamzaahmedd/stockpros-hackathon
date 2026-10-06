/**
 * Staff view of a customer's metering position: the blocked-reason rules must
 * mirror consumeAiSignal (allowance, then spend cap, then credit balance), and
 * every read is audited before it is returned.
 */
const mockPrisma: any = {
  user: { findUnique: jest.fn() },
  adminAuditLog: { create: jest.fn() },
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const mockGetMyUsage = jest.fn()
jest.mock('../../payments/public', () => ({
  CreditPool: { USER: 'USER', TEAM: 'TEAM' },
  getMyUsage: (...args: unknown[]) => mockGetMyUsage(...args),
}))

import { AdminAuditAction } from '@prisma/client'
import { NotFoundError, OverageReason } from '../../../shared/errors'
import { getUserUsage, resolveBlockedReason } from '../usage-service'

const ADMIN = '0191e4a0-0000-7000-8000-0000000000aa'
const USER = '0191e4a0-0000-7000-8000-0000000000bb'
const COST = 100

const credits = (pool: string, balanceInPaisa: number) => ({
  pool,
  balanceInPaisa,
  costPerSignalPaisa: COST,
})

const cap = (limit: number, spent: number) => ({
  monthlyLimitPaisa: limit,
  spentPaisa: spent,
  remainingPaisa: Math.max(limit - spent, 0),
})

const usage = (overrides: Record<string, unknown> = {}): any => ({
  plan: 'PRO',
  metered: true,
  quota: { limit: 300, used: 300, remaining: 0 },
  credits: credits('USER', 10_000),
  alertsEnabled: true,
  spendCap: null,
  ...overrides,
})

describe('resolveBlockedReason', () => {
  it('is null for unmetered (FREE) plans', () => {
    expect(
      resolveBlockedReason(
        usage({ metered: false, quota: null, credits: null }),
      ),
    ).toBeNull()
  })

  it('is null while the base allowance remains, whatever the cap or balance', () => {
    expect(
      resolveBlockedReason(
        usage({
          quota: { limit: 300, used: 10, remaining: 290 },
          spendCap: cap(0, 0),
        }),
      ),
    ).toBeNull()
  })

  it('reports the personal cap for an individual once it cannot cover one signal', () => {
    expect(resolveBlockedReason(usage({ spendCap: cap(5_000, 4_950) }))).toBe(
      OverageReason.PERSONAL_SPEND_LIMIT_REACHED,
    )
  })

  it('reports the admin-set cap for a workspace member', () => {
    expect(
      resolveBlockedReason(
        usage({
          credits: credits('TEAM', 10_000),
          spendCap: cap(5_000, 5_000),
        }),
      ),
    ).toBe(OverageReason.SPEND_LIMIT_REACHED)
  })

  it('checks the cap before the balance, as enforcement does', () => {
    expect(
      resolveBlockedReason(
        usage({ credits: credits('USER', 0), spendCap: cap(1, 1) }),
      ),
    ).toBe(OverageReason.PERSONAL_SPEND_LIMIT_REACHED)
  })

  it('reports insufficient credits when no cap blocks but the pool is empty', () => {
    expect(resolveBlockedReason(usage({ credits: credits('USER', 99) }))).toBe(
      OverageReason.INSUFFICIENT_CREDITS,
    )
  })

  it('is null when the allowance is spent but credits can pay and no cap blocks', () => {
    expect(resolveBlockedReason(usage())).toBeNull()
    expect(
      resolveBlockedReason(usage({ spendCap: cap(5_000, 100) })),
    ).toBeNull()
  })
})

describe('getUserUsage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.adminAuditLog.create.mockResolvedValue({})
  })

  it('returns the meter with the blocked reason and audits the read', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: USER })
    mockGetMyUsage.mockResolvedValue(usage({ credits: credits('USER', 0) }))

    const result = await getUserUsage(
      { adminId: ADMIN, ipAddress: '10.0.0.7' },
      USER,
    )

    expect(mockGetMyUsage).toHaveBeenCalledWith(USER)
    expect(result).toMatchObject({
      userId: USER,
      plan: 'PRO',
      alertsEnabled: true,
      blockedReason: OverageReason.INSUFFICIENT_CREDITS,
    })
    const { data } = mockPrisma.adminAuditLog.create.mock.calls[0][0]
    expect(data).toMatchObject({
      adminId: ADMIN,
      action: AdminAuditAction.CUSTOMER_DATA_VIEWED,
      targetType: 'USER',
    })
    expect(data.metadata.resultIds).toEqual([USER])
  })

  it('404s for an unknown user without reading usage or auditing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)

    await expect(getUserUsage({ adminId: ADMIN }, USER)).rejects.toThrow(
      NotFoundError,
    )
    expect(mockGetMyUsage).not.toHaveBeenCalled()
    expect(mockPrisma.adminAuditLog.create).not.toHaveBeenCalled()
  })

  it('does not return data when the read audit fails', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: USER })
    mockGetMyUsage.mockResolvedValue(usage())
    mockPrisma.adminAuditLog.create.mockRejectedValue(new Error('db down'))

    await expect(getUserUsage({ adminId: ADMIN }, USER)).rejects.toThrow(
      'db down',
    )
  })
})
