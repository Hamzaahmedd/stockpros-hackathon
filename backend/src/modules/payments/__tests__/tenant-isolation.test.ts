/**
 * Cross-tenant isolation for the payments routes that act on a workspace:
 * billing history and receipts, the credit ledger, renewal, seat additions,
 * top-ups and the auto-renew flag. As in the teams suite, a user of workspace
 * B aims at workspace A's data in a shared in-memory database (see
 * src/__tests__/fake-tenant-db.ts) and must be refused or see only B's rows.
 * Proves the queries carry the right filters — not that Postgres enforces it.
 */
import { createFakeDb, type Row } from '../../../__tests__/fake-tenant-db'

let db: ReturnType<typeof createFakeDb>

jest.mock('../../../shared/infrastructure/database', () => ({
  get prisma() {
    return db
  },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  ...jest.requireActual('../../../shared/infrastructure/team-access'),
  getActiveMembership: jest.fn(),
  findRestrictingDomain: jest.fn(),
}))

jest.mock('../client', () => ({
  initPaymentSession: jest.fn().mockResolvedValue({ token: 'trk-new' }),
  buildCheckoutUrl: jest.fn().mockReturnValue('https://pay/trk-new'),
}))

import { PaymentKind, TeamRole } from '@prisma/client'
import { getActiveMembership } from '../../../shared/infrastructure/team-access'
import { TopupPackId } from '../constants'
import { getCreditLedger } from '../ledger'
import { getUsageHistory } from '../usage-history'
import { setSpendCap } from '../spend-cap'
import { getTeamReceipt, listTeamTransactions } from '../receipts'
import {
  createSeatAdditionCheckout,
  createTeamRenewalCheckout,
  createTopupCheckout,
  getTeamSubscriptionSummary,
  toggleTeamAutoRenew,
} from '../team-billing'

const A = 'team-A'
const B = 'team-B'

const teamWith = (id: string) => ({
  id,
  status: 'ACTIVE',
  seatCapacity: 4,
  scheduledSeatCapacity: null,
  subscription: {
    id: `sub-${id}`,
    paymentMethod: 'WALLET',
    autoRenew: false,
    status: 'ACTIVE',
    currentPeriodEnd: null,
    gracePeriodEnd: null,
  },
})

const fixtures = (): Record<string, Row[]> => ({
  user: [
    { id: 'a-owner', displayName: 'Alice', email: 'a@x.com' },
    { id: 'b-owner', displayName: 'Bob', email: 'b@x.com' },
    { id: 'b-member', displayName: 'Bea', email: 'bea@x.com' },
  ],
  team: [
    {
      id: A,
      name: 'Alpha',
      billingEmail: null,
      creditBalanceInPaisa: 111,
      owner: { email: 'a@x.com' },
    },
    {
      id: B,
      name: 'Beta',
      billingEmail: null,
      creditBalanceInPaisa: 222,
      owner: { email: 'b@x.com' },
    },
  ],
  // The rows as loaded with `include: { team: { include: { subscription } } }`.
  teamMember: [
    {
      id: 'm1',
      teamId: A,
      userId: 'a-owner',
      role: TeamRole.OWNER,
      team: teamWith(A),
    },
    {
      id: 'm2',
      teamId: B,
      userId: 'b-owner',
      role: TeamRole.OWNER,
      team: teamWith(B),
    },
    {
      id: 'm3',
      teamId: B,
      userId: 'b-member',
      role: TeamRole.MEMBER,
      team: teamWith(B),
    },
  ],
  teamInvite: [],
  subscription: [
    { id: `sub-${A}`, teamId: A, autoRenew: false },
    { id: `sub-${B}`, teamId: B, autoRenew: false },
  ],
  paymentTransaction: [
    {
      id: 'txn-A',
      teamId: A,
      status: 'COMPLETED',
      kind: PaymentKind.SUBSCRIPTION,
      amountPaisa: 100,
      currency: 'PKR',
      seatCount: 1,
      createdAt: new Date('2030-01-01'),
      updatedAt: new Date('2030-01-01'),
    },
    {
      id: 'txn-B',
      teamId: B,
      status: 'COMPLETED',
      kind: PaymentKind.SUBSCRIPTION,
      amountPaisa: 200,
      currency: 'PKR',
      seatCount: 2,
      createdAt: new Date('2030-01-01'),
      updatedAt: new Date('2030-01-01'),
    },
  ],
  creditLedger: [
    {
      id: 'led-A',
      teamId: A,
      userId: 'a-owner',
      amountPaisa: 50,
      type: 'PURCHASE',
      description: 'A',
      createdAt: new Date('2030-01-02'),
    },
    {
      id: 'led-B',
      teamId: B,
      userId: 'b-owner',
      amountPaisa: 70,
      type: 'PURCHASE',
      description: 'B',
      createdAt: new Date('2030-01-01'),
    },
  ],
})

const asUser = (userId: string) =>
  (getActiveMembership as jest.Mock).mockImplementation(async (id: string) => {
    const row = db.teamMember.rows.find((m) => m.userId === id)
    return row
      ? {
          teamId: row.teamId,
          role: row.role,
          monthlyCreditLimitPaisa: null,
          orgInstructions: null,
        }
      : null
  })

beforeEach(() => {
  db = createFakeDb(fixtures())
  jest.clearAllMocks()
})

describe('billing history and receipts', () => {
  it("lists only the caller's workspace transactions", async () => {
    asUser('b-owner')
    const page = await listTeamTransactions('b-owner', { limit: 25 })
    expect(page.entries.map((entry) => entry.id)).toEqual(['txn-B'])
  })

  it('a receipt from another workspace is indistinguishable from a missing one', async () => {
    asUser('b-owner')
    await expect(getTeamReceipt('b-owner', 'txn-A')).rejects.toMatchObject({
      statusCode: 404,
    })
    await expect(getTeamReceipt('b-owner', 'txn-B')).resolves.toMatchObject({
      id: 'txn-B',
      teamName: 'Beta',
    })
  })

  it("a cursor taken from another workspace's history is refused", async () => {
    asUser('b-owner')
    await expect(
      listTeamTransactions('b-owner', { limit: 25, cursor: 'txn-A' }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('plain members see nothing', async () => {
    asUser('b-member')
    await expect(
      listTeamTransactions('b-member', { limit: 25 }),
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('credit ledger', () => {
  it("shows only the caller's workspace pool", async () => {
    asUser('b-owner')
    const page = await getCreditLedger('b-owner', {
      scope: 'TEAM',
      limit: 25,
    } as never)
    expect(page.entries.map((entry) => entry.id)).toEqual(['led-B'])
    expect(page.balanceInPaisa).toBe(222)
  })

  it("refuses a cursor from another workspace's ledger", async () => {
    asUser('b-owner')
    await expect(
      getCreditLedger('b-owner', {
        scope: 'TEAM',
        limit: 25,
        cursor: 'led-A',
      } as never),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it("a personal view lists the caller's own activity only — never another workspace's", async () => {
    asUser('b-owner')
    const own = await getCreditLedger('b-owner', {
      scope: 'USER',
      limit: 25,
    } as never)
    expect(own.entries.map((entry) => entry.id)).toEqual(['led-B'])

    asUser('b-member')
    const other = await getCreditLedger('b-member', {
      scope: 'USER',
      limit: 25,
    } as never)
    expect(other.entries).toEqual([])
  })
})

describe('usage history', () => {
  // The aggregate is a raw SQL query the in-memory db cannot execute, so this
  // asserts the tenant predicate bound into it: which team id it filters on.
  const boundValues = (): unknown[] => {
    const query = (db.$queryRaw as unknown as jest.Mock).mock.calls.at(-1)[0]
    return query.values
  }

  beforeEach(() => {
    db.$queryRaw = jest.fn().mockResolvedValue([])
  })

  it("an admin's workspace aggregate filters on their own team, never another", async () => {
    asUser('b-owner')
    const history = await getUsageHistory('b-owner')
    expect(history.scope).toBe('TEAM')
    expect(boundValues()).toContain(B)
    expect(boundValues()).not.toContain(A)
  })

  it("a plain member's view is limited to their own events in their own team", async () => {
    asUser('b-member')
    const history = await getUsageHistory('b-member')
    expect(history.scope).toBe('USER')
    expect(boundValues()).toEqual(expect.arrayContaining(['b-member', B]))
    expect(boundValues()).not.toContain(A)
  })

  it('a user outside any workspace never gets a workspace aggregate', async () => {
    asUser('nobody')
    db.user.rows.push({ id: 'nobody', displayName: 'N', email: 'n@x.com' })
    const history = await getUsageHistory('nobody')
    expect(history.scope).toBe('USER')
    expect(boundValues()).not.toContain(A)
    expect(boundValues()).not.toContain(B)
  })
})

describe('personal spending limit', () => {
  beforeEach(() => {
    db.user.rows.push({
      id: 'solo',
      displayName: 'Solo',
      email: 's@x.com',
      plan: 'PRO',
    })
    Object.assign(db, { usageEvent: { count: jest.fn().mockResolvedValue(0) } })
    db.$queryRaw = jest.fn().mockResolvedValue([])
  })

  it.each(['a-owner', 'b-owner', 'b-member'])(
    'workspace user %s cannot set one: limits for members belong to their admins',
    async (userId) => {
      asUser(userId)
      db.user.update = jest.fn()
      await expect(setSpendCap(userId, 20_000)).rejects.toMatchObject({
        statusCode: 403,
      })
      expect(db.user.update).not.toHaveBeenCalled()
    },
  )

  it('an individual only ever writes their own row', async () => {
    asUser('solo')
    const update = jest.fn()
    db.user.update = update

    await setSpendCap('solo', 20_000)

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({
      where: { id: 'solo' },
      data: { monthlyCreditLimitPaisa: 20_000 },
    })
  })
})

describe('checkouts and subscription settings act on the caller’s workspace', () => {
  it('renewal is created for B, never A', async () => {
    asUser('b-owner')
    await createTeamRenewalCheckout('b-owner')
    const created = db.paymentTransaction.rows.find((row) =>
      row.id.includes('new'),
    )
    expect(created).toMatchObject({ teamId: B, subscriptionId: `sub-${B}` })
  })

  it('seat additions are created for B, never A', async () => {
    asUser('b-owner')
    await createSeatAdditionCheckout('b-owner', 2)
    expect(
      db.paymentTransaction.rows.find((row) => row.id.includes('new')),
    ).toMatchObject({ teamId: B, kind: PaymentKind.SEAT_ADDITION })
  })

  it("top-ups credit B's pool, never A's", async () => {
    asUser('b-owner')
    await createTopupCheckout('b-owner', TopupPackId.PACK_500)
    expect(
      db.paymentTransaction.rows.find((row) => row.id.includes('new')),
    ).toMatchObject({ teamId: B, kind: PaymentKind.TOPUP })
  })

  it('a plain member of B cannot start any of them', async () => {
    asUser('b-member')
    await expect(createTeamRenewalCheckout('b-member')).rejects.toMatchObject({
      statusCode: 403,
    })
    await expect(
      createTopupCheckout('b-member', TopupPackId.PACK_500),
    ).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it("the auto-renew flag flips B's subscription only", async () => {
    asUser('b-owner')
    await toggleTeamAutoRenew('b-owner', true)
    expect(db.subscription.rows.find((s) => s.teamId === B)?.autoRenew).toBe(
      true,
    )
    expect(db.subscription.rows.find((s) => s.teamId === A)?.autoRenew).toBe(
      false,
    )
  })

  it("the subscription summary is B's", async () => {
    asUser('b-owner')
    await expect(getTeamSubscriptionSummary('b-owner')).resolves.toMatchObject({
      paymentMethod: 'WALLET',
    })
  })
})
