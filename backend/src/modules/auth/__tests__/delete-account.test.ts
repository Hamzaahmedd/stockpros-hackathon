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
    team: {
      findFirst: jest.fn(),
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
    ;(prisma.team.findFirst as jest.Mock).mockResolvedValue(null)

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
      magicLinkToken: { deleteMany: jest.fn() },
      phoneOtp: { deleteMany: jest.fn() },
      teamMember: { deleteMany: jest.fn() },
      teamInvite: { deleteMany: jest.fn() },
      team: { updateMany: jest.fn() },
      user: { update: jest.fn().mockResolvedValue({}) },
    }
    ;(prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    )

    await expect(deleteAccount('user-1')).resolves.toBeUndefined()

    expect('paymentTransaction' in tx).toBe(false)
  })
})

describe('deleteAccount — team workspace guard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      status: UserStatus.ACTIVE,
    })
  })

  it('refuses to delete the owner of an ACTIVE team, before revoking anything', async () => {
    ;(prisma.team.findFirst as jest.Mock).mockResolvedValue({ id: 'team-1' })

    await expect(deleteAccount('user-1')).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(prisma.team.findFirst).toHaveBeenCalledWith({
      where: { ownerId: 'user-1', status: 'ACTIVE' },
      select: { id: true },
    })
    expect(prisma.userSession.updateMany).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('removes the team seat in the purge transaction and allows a CANCELLED-team owner to delete', async () => {
    // No ACTIVE workspace is owned (a cancelled or deleted one does not block).
    ;(prisma.team.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.userSession.updateMany as jest.Mock).mockResolvedValue({
      count: 0,
    })
    const deleteMany = () => ({ deleteMany: jest.fn() })
    const tx = {
      watchlistAlert: deleteMany(),
      watchlist: deleteMany(),
      notification: deleteMany(),
      newsReadState: deleteMany(),
      newsSavedArticle: deleteMany(),
      decisionRun: deleteMany(),
      portfolio: deleteMany(),
      userRole: deleteMany(),
      magicLinkToken: deleteMany(),
      phoneOtp: deleteMany(),
      teamMember: deleteMany(),
      teamInvite: deleteMany(),
      team: { updateMany: jest.fn() },
      user: { update: jest.fn().mockResolvedValue({}) },
    }
    ;(prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    )

    await expect(deleteAccount('user-1')).resolves.toBeUndefined()
    expect(tx.teamMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
  })

  it("purges pending team invites addressed to the deleted user's email (invite rows are PII), case-insensitively", async () => {
    ;(prisma.team.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.userSession.updateMany as jest.Mock).mockResolvedValue({
      count: 0,
    })
    const deleteMany = () => ({ deleteMany: jest.fn() })
    const tx = {
      watchlistAlert: deleteMany(),
      watchlist: deleteMany(),
      notification: deleteMany(),
      newsReadState: deleteMany(),
      newsSavedArticle: deleteMany(),
      decisionRun: deleteMany(),
      portfolio: deleteMany(),
      userRole: deleteMany(),
      magicLinkToken: deleteMany(),
      phoneOtp: deleteMany(),
      teamMember: deleteMany(),
      teamInvite: deleteMany(),
      team: { updateMany: jest.fn() },
      user: { update: jest.fn().mockResolvedValue({}) },
    }
    ;(prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    )

    await deleteAccount('user-1')

    // The owner's chosen billing contact is personal data: cleared with the account.
    expect(tx.team.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 'user-1' },
      data: { billingEmail: null },
    })
    expect(tx.teamInvite.deleteMany).toHaveBeenCalledWith({
      where: { email: { equals: 'user@example.com', mode: 'insensitive' } },
    })
  })
})
