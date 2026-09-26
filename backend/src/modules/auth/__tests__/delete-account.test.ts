/**
 * Regression guard for the CLAUDE.md audit-retention rule: deleting an
 * account purges PII from primary tables, but `PaymentTransaction` rows are
 * financial/audit records (retained by userId, not PII) and must never be
 * touched by this purge. If a future change adds
 * `tx.paymentTransaction.deleteMany(...)` to the transaction, this test's
 * mock `tx` (which deliberately has no `paymentTransaction` key) will throw
 * a TypeError and fail.
 */

jest.mock('../../market/infrastructure/finnhub-stream', () => ({
  finnhubService: {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    getQuote: jest.fn().mockResolvedValue({ c: 100, d: 1 }),
  },
}))

jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    userSession: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

import { UserStatus } from '@prisma/client'
import { prisma } from '../../../shared/infrastructure/database'
import { deleteAccount } from '../service'

describe('deleteAccount — payment transaction retention', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('never calls paymentTransaction.deleteMany during the PII purge transaction', async () => {
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      status: UserStatus.ACTIVE,
    })
    ;(prisma.userSession.updateMany as jest.Mock).mockResolvedValue({
      count: 0,
    })

    // Deliberately omits `paymentTransaction` — if service.ts is ever
    // changed to purge payment records, this mock throws and the test fails.
    const tx = {
      watchlistAlert: { deleteMany: jest.fn() },
      watchlist: { deleteMany: jest.fn() },
      notification: { deleteMany: jest.fn() },
      newsReadState: { deleteMany: jest.fn() },
      newsSavedArticle: { deleteMany: jest.fn() },
      decisionRun: { deleteMany: jest.fn() },
      portfolio: { deleteMany: jest.fn() },
      userRole: { deleteMany: jest.fn() },
      userPermission: { deleteMany: jest.fn() },
      magicLinkToken: { deleteMany: jest.fn() },
      phoneOtp: { deleteMany: jest.fn() },
      user: { update: jest.fn().mockResolvedValue({}) },
    }
    ;(prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    )

    await expect(deleteAccount('user-1')).resolves.toBeUndefined()

    expect('paymentTransaction' in tx).toBe(false)
  })
})
