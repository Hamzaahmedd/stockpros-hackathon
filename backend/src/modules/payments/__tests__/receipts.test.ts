const mockPrisma: any = {
  paymentTransaction: { findMany: jest.fn(), findFirst: jest.fn() },
  team: { findUniqueOrThrow: jest.fn() },
}

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return mockPrisma
  },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  ...jest.requireActual('../../../shared/infrastructure/team-access'),
  getActiveMembership: jest.fn(),
}))

import { PaymentKind, TeamRole } from '@prisma/client'
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/errors'
import { getActiveMembership } from '../../../shared/infrastructure/team-access'
import {
  getTeamReceipt,
  listTeamTransactions,
  receiptNumber,
} from '../receipts'

const TEAM = 'team-1'
const asRole = (role: TeamRole) =>
  (getActiveMembership as jest.Mock).mockResolvedValue({
    teamId: TEAM,
    role,
    monthlyCreditLimitPaisa: null,
    orgInstructions: null,
  })

const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  kind: PaymentKind.SUBSCRIPTION,
  status: 'COMPLETED',
  amountPaisa: 1_499_800,
  currency: 'PKR',
  seatCount: 2,
  createdAt: new Date('2030-03-05T10:00:00Z'),
  ...overrides,
})

beforeEach(() => {
  jest.resetAllMocks()
  asRole(TeamRole.OWNER)
})

describe('receiptNumber', () => {
  it('uses the year and the random tail of the id (the head of a UUIDv7 is a shared timestamp)', () => {
    expect(
      receiptNumber(
        '0190a1b2-c3d4-7e5f-8a9b-0123456789ab',
        new Date('2030-03-05T10:00:00Z'),
      ),
    ).toBe('SP-2030-456789AB')
  })

  it('gives different references to payments made in the same timestamp window', () => {
    const created = new Date('2030-03-05T10:00:00Z')
    expect(
      receiptNumber('0190a1b2-0000-7000-8000-000000000001', created),
    ).not.toBe(receiptNumber('0190a1b2-0000-7000-8000-000000000002', created))
  })
})

describe('access', () => {
  it('404s when the caller is not in an active workspace', async () => {
    ;(getActiveMembership as jest.Mock).mockResolvedValue(null)
    await expect(
      listTeamTransactions('u1', { limit: 25 }),
    ).rejects.toBeInstanceOf(NotFoundError)
    await expect(getTeamReceipt('u1', 'txn-1')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('refuses plain members', async () => {
    asRole(TeamRole.MEMBER)
    await expect(
      listTeamTransactions('u1', { limit: 25 }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(getTeamReceipt('u1', 'txn-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('allows admins', async () => {
    asRole(TeamRole.ADMIN)
    mockPrisma.paymentTransaction.findMany.mockResolvedValue([])
    await expect(listTeamTransactions('u1', { limit: 25 })).resolves.toEqual({
      entries: [],
      nextCursor: null,
    })
  })
})

describe('listTeamTransactions', () => {
  it('lists only this workspace’s paid transactions, newest first', async () => {
    mockPrisma.paymentTransaction.findMany.mockResolvedValue([])
    await listTeamTransactions('u1', { limit: 10 })

    const args = mockPrisma.paymentTransaction.findMany.mock.calls[0][0]
    expect(args.where).toEqual({
      teamId: TEAM,
      status: { in: ['COMPLETED', 'REFUNDED'] },
    })
    expect(args.take).toBe(11)
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
  })

  it('never selects the webhook payload or the gateway token', async () => {
    mockPrisma.paymentTransaction.findMany.mockResolvedValue([])
    await listTeamTransactions('u1', { limit: 10 })
    const { select } = mockPrisma.paymentTransaction.findMany.mock.calls[0][0]
    expect(select).not.toHaveProperty('rawWebhookPayload')
    expect(select).not.toHaveProperty('token')
    expect(select).not.toHaveProperty('trackerId')
  })

  it('rejects a cursor that belongs to another workspace', async () => {
    mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null)
    await expect(
      listTeamTransactions('u1', { limit: 10, cursor: 'foreign' }),
    ).rejects.toBeInstanceOf(BadRequestError)
    expect(mockPrisma.paymentTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', teamId: TEAM },
      select: { id: true },
    })
    expect(mockPrisma.paymentTransaction.findMany).not.toHaveBeenCalled()
  })

  it('pages with a cursor and reports the next one', async () => {
    mockPrisma.paymentTransaction.findFirst.mockResolvedValue({ id: 'c' })
    mockPrisma.paymentTransaction.findMany.mockResolvedValue([
      row('0190a1b2-0000-7000-8000-0000000000a1'),
      row('0190a1b2-0000-7000-8000-0000000000a2', {
        kind: PaymentKind.TOPUP,
      }),
      row('0190a1b2-0000-7000-8000-0000000000a3'),
    ])

    const page = await listTeamTransactions('u1', { limit: 2, cursor: 'c' })

    expect(
      mockPrisma.paymentTransaction.findMany.mock.calls[0][0],
    ).toMatchObject({ cursor: { id: 'c' }, skip: 1 })
    expect(page.entries).toHaveLength(2)
    expect(page.nextCursor).toBe('0190a1b2-0000-7000-8000-0000000000a2')
    expect(page.entries[0]).toMatchObject({
      referenceNumber: 'SP-2030-000000A1',
      description: 'Team plan subscription',
    })
    expect(page.entries[1].description).toBe('Credit top-up')
  })

  it('has no next cursor on the last page', async () => {
    mockPrisma.paymentTransaction.findMany.mockResolvedValue([row('a')])
    expect(
      (await listTeamTransactions('u1', { limit: 5 })).nextCursor,
    ).toBeNull()
  })
})

describe('getTeamReceipt', () => {
  const receipt = (overrides: Record<string, unknown> = {}) => ({
    ...row('0190a1b2-0000-7000-8000-0000000000b1'),
    paymentMethod: 'card',
    updatedAt: new Date('2030-03-05T10:05:00Z'),
    ...overrides,
  })
  const team = (billingEmail: string | null) =>
    mockPrisma.team.findUniqueOrThrow.mockResolvedValue({
      name: 'Alpha Fund',
      billingEmail,
      owner: { email: 'owner@fund.com' },
    })

  it('looks the receipt up by id AND workspace, so a foreign id is just a 404', async () => {
    mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null)
    await expect(getTeamReceipt('u1', 'foreign')).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(
      mockPrisma.paymentTransaction.findFirst.mock.calls[0][0].where,
    ).toEqual({
      id: 'foreign',
      teamId: TEAM,
      status: { in: ['COMPLETED', 'REFUNDED'] },
    })
  })

  it('never selects the webhook payload or the gateway token', async () => {
    mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null)
    await getTeamReceipt('u1', 'x').catch(() => undefined)
    const { select } = mockPrisma.paymentTransaction.findFirst.mock.calls[0][0]
    expect(select).not.toHaveProperty('rawWebhookPayload')
    expect(select).not.toHaveProperty('token')
  })

  it('shows the per-seat price and bills the billing contact', async () => {
    mockPrisma.paymentTransaction.findFirst.mockResolvedValue(receipt())
    team('billing@fund.com')

    await expect(getTeamReceipt('u1', 'x')).resolves.toMatchObject({
      referenceNumber: 'SP-2030-000000B1',
      kind: 'SUBSCRIPTION',
      description: 'Team plan subscription',
      amountPaisa: 1_499_800,
      seatCount: 2,
      unitPricePaisa: 749_900,
      paymentMethod: 'card',
      teamName: 'Alpha Fund',
      billedTo: 'billing@fund.com',
      paidAt: new Date('2030-03-05T10:05:00Z'),
    })
  })

  it('falls back to the owner when no billing contact is set', async () => {
    mockPrisma.paymentTransaction.findFirst.mockResolvedValue(receipt())
    team(null)
    expect((await getTeamReceipt('u1', 'x')).billedTo).toBe('owner@fund.com')
  })

  it('has no unit price for a credit top-up', async () => {
    mockPrisma.paymentTransaction.findFirst.mockResolvedValue(
      receipt({ kind: PaymentKind.TOPUP, seatCount: 1, amountPaisa: 50_000 }),
    )
    team(null)
    expect((await getTeamReceipt('u1', 'x')).unitPricePaisa).toBeNull()
  })

  it('prices added seats per seat', async () => {
    mockPrisma.paymentTransaction.findFirst.mockResolvedValue(
      receipt({
        kind: PaymentKind.SEAT_ADDITION,
        seatCount: 3,
        amountPaisa: 2_249_700,
      }),
    )
    team(null)
    expect((await getTeamReceipt('u1', 'x')).unitPricePaisa).toBe(749_900)
  })
})
