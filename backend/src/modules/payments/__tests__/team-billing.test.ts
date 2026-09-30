jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    team: { findUnique: jest.fn() },
    teamMember: { findUnique: jest.fn() },
    subscription: { update: jest.fn() },
    paymentTransaction: { create: jest.fn() },
  },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  // keep the real, pure role check; only the DB-backed lookups are faked
  isTeamAdminRole: jest.requireActual(
    '../../../shared/infrastructure/team-access',
  ).isTeamAdminRole,
  findRestrictingDomain: jest.fn(),
  getActiveMembership: jest.fn(),
}))

jest.mock('../client', () => ({
  initPaymentSession: jest.fn(),
  buildCheckoutUrl: jest.fn(),
}))

import { TeamRole } from '@prisma/client'
import { prisma } from '../../../shared/infrastructure/database'
import {
  findRestrictingDomain,
  getActiveMembership,
} from '../../../shared/infrastructure/team-access'
import { buildCheckoutUrl, initPaymentSession } from '../client'
import {
  TEAM_SEAT_PRICE_PAISA,
  TOPUP_PACK_PRICES_PAISA,
  TopupPackId,
} from '../constants'
import {
  assertCanCreateTeam,
  createSeatAdditionCheckout,
  createTeamCheckout,
  createTeamRenewalCheckout,
  createTopupCheckout,
  getTeamSubscriptionSummary,
  toggleTeamAutoRenew,
} from '../team-billing'

const db = prisma as any

const teamFor = (overrides: Record<string, any> = {}) => ({
  id: 'team-1',
  status: 'ACTIVE',
  seatCapacity: 10,
  subscription: {
    id: 'sub-1',
    paymentMethod: 'WALLET',
    autoRenew: false,
    status: 'ACTIVE',
    currentPeriodEnd: null,
    gracePeriodEnd: null,
  },
  ...overrides,
})

const asMember = (role: TeamRole, team = teamFor()) =>
  db.teamMember.findUnique.mockResolvedValue({ role, team })

beforeEach(() => {
  jest.resetAllMocks()
  ;(initPaymentSession as jest.Mock).mockResolvedValue({ token: 'trk-1' })
  ;(buildCheckoutUrl as jest.Mock).mockReturnValue('https://pay/trk-1')
  db.paymentTransaction.create.mockResolvedValue({ id: 'txn-1' })
})

const createdData = () => db.paymentTransaction.create.mock.calls[0][0].data

describe('assertCanCreateTeam', () => {
  beforeEach(() => {
    db.user.findUnique.mockResolvedValue({ email: 'a@fund.com' })
    db.teamMember.findUnique.mockResolvedValue(null)
    db.team.findUnique.mockResolvedValue(null)
    ;(findRestrictingDomain as jest.Mock).mockResolvedValue(null)
  })

  it('passes for a user with no workspace and an unrestricted domain', async () => {
    await expect(assertCanCreateTeam('user-1')).resolves.toBeUndefined()
  })

  it("blocks creation when the email's domain is verified + restricted, pointing at the org admin", async () => {
    ;(findRestrictingDomain as jest.Mock).mockResolvedValue({
      domain: 'fund.com',
    })

    await expect(assertCanCreateTeam('user-1')).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining("organization's admin"),
    })
  })

  it('conflicts when the user already belongs to or owns a workspace', async () => {
    db.teamMember.findUnique.mockResolvedValue({ id: 'm' })
    await expect(assertCanCreateTeam('user-1')).rejects.toMatchObject({
      statusCode: 409,
    })

    db.teamMember.findUnique.mockResolvedValue(null)
    db.team.findUnique.mockResolvedValue({ id: 't' })
    await expect(assertCanCreateTeam('user-1')).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('404s for an unknown user', async () => {
    db.user.findUnique.mockResolvedValue(null)
    await expect(assertCanCreateTeam('nope')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('createTeamCheckout', () => {
  beforeEach(() => {
    db.user.findUnique.mockResolvedValue({ email: 'a@fund.com' })
    db.teamMember.findUnique.mockResolvedValue(null)
    db.team.findUnique.mockResolvedValue(null)
    ;(findRestrictingDomain as jest.Mock).mockResolvedValue(null)
  })

  it('derives price = seatCount * 749900 paisa server-side and stores the team name', async () => {
    const result = await createTeamCheckout('user-1', {
      teamName: 'Alpha',
      seatCount: 4,
    })

    expect(initPaymentSession).toHaveBeenCalledWith(4 * TEAM_SEAT_PRICE_PAISA)
    expect(createdData()).toMatchObject({
      userId: 'user-1',
      trackerId: 'trk-1',
      token: 'trk-1',
      amountPaisa: 2_999_600,
      seatCount: 4,
      kind: 'SUBSCRIPTION',
      planTier: 'TEAM',
      status: 'PENDING',
      metadata: { teamName: 'Alpha' },
    })
    expect(createdData().teamId).toBeUndefined()
    expect(result).toEqual({
      checkoutUrl: 'https://pay/trk-1',
      trackerId: 'trk-1',
    })
  })

  it('never reaches Safepay when the creation guard fails', async () => {
    ;(findRestrictingDomain as jest.Mock).mockResolvedValue({
      domain: 'fund.com',
    })
    await expect(
      createTeamCheckout('user-1', { teamName: 'Alpha', seatCount: 2 }),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(initPaymentSession).not.toHaveBeenCalled()
  })
})

describe('createSeatAdditionCheckout', () => {
  it('prices only the new seats and links the transaction to the team', async () => {
    asMember(TeamRole.ADMIN)

    await createSeatAdditionCheckout('user-1', 3)

    expect(initPaymentSession).toHaveBeenCalledWith(3 * TEAM_SEAT_PRICE_PAISA)
    expect(createdData()).toMatchObject({
      teamId: 'team-1',
      seatCount: 3,
      kind: 'SEAT_ADDITION',
      planTier: 'TEAM',
    })
  })

  it('rejects plain members, non-members, lapsed teams and >150 seats', async () => {
    asMember(TeamRole.MEMBER)
    await expect(createSeatAdditionCheckout('u', 1)).rejects.toMatchObject({
      statusCode: 403,
    })

    db.teamMember.findUnique.mockResolvedValue(null)
    await expect(createSeatAdditionCheckout('u', 1)).rejects.toMatchObject({
      statusCode: 404,
    })

    asMember(TeamRole.OWNER, teamFor({ status: 'CANCELLED' }))
    await expect(createSeatAdditionCheckout('u', 1)).rejects.toMatchObject({
      statusCode: 400,
    })

    asMember(TeamRole.OWNER, teamFor({ seatCapacity: 149 }))
    await expect(createSeatAdditionCheckout('u', 2)).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(initPaymentSession).not.toHaveBeenCalled()
  })

  it('allows filling the workspace exactly to 150 seats', async () => {
    asMember(TeamRole.OWNER, teamFor({ seatCapacity: 149 }))
    await expect(createSeatAdditionCheckout('u', 1)).resolves.toBeDefined()
  })
})

describe('createTeamRenewalCheckout', () => {
  it('charges the full current capacity and links the existing subscription, even for a lapsed team', async () => {
    asMember(TeamRole.OWNER, teamFor({ status: 'CANCELLED', seatCapacity: 8 }))

    await createTeamRenewalCheckout('user-1')

    expect(initPaymentSession).toHaveBeenCalledWith(8 * TEAM_SEAT_PRICE_PAISA)
    expect(createdData()).toMatchObject({
      teamId: 'team-1',
      seatCount: 8,
      subscriptionId: 'sub-1',
      kind: 'SUBSCRIPTION',
    })
  })
})

describe('createTopupCheckout', () => {
  it('credits the team pool when an owner/admin buys', async () => {
    ;(getActiveMembership as jest.Mock).mockResolvedValue({
      teamId: 'team-1',
      role: TeamRole.ADMIN,
    })

    await createTopupCheckout('user-1', TopupPackId.PACK_1000)

    expect(initPaymentSession).toHaveBeenCalledWith(
      TOPUP_PACK_PRICES_PAISA[TopupPackId.PACK_1000],
    )
    expect(createdData()).toMatchObject({
      teamId: 'team-1',
      kind: 'TOPUP',
      planTier: 'TEAM',
      amountPaisa: 100_000,
      metadata: { packId: 'PACK_1000' },
    })
  })

  it('forbids plain team members from topping up the shared pool', async () => {
    ;(getActiveMembership as jest.Mock).mockResolvedValue({
      teamId: 'team-1',
      role: TeamRole.MEMBER,
    })
    await expect(
      createTopupCheckout('user-1', TopupPackId.PACK_500),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(initPaymentSession).not.toHaveBeenCalled()
  })

  it('credits the individual balance for a PRO user', async () => {
    ;(getActiveMembership as jest.Mock).mockResolvedValue(null)
    db.user.findUnique.mockResolvedValue({ plan: 'PRO' })

    await createTopupCheckout('user-1', TopupPackId.PACK_2500)

    expect(createdData()).toMatchObject({
      userId: 'user-1',
      kind: 'TOPUP',
      planTier: 'PRO',
      amountPaisa: 250_000,
    })
    expect(createdData().teamId).toBeUndefined()
  })

  it.each(['FREE', undefined])(
    'forbids a %s user from buying credits',
    async (plan) => {
      ;(getActiveMembership as jest.Mock).mockResolvedValue(null)
      db.user.findUnique.mockResolvedValue(plan ? { plan } : null)
      await expect(
        createTopupCheckout('user-1', TopupPackId.PACK_500),
      ).rejects.toMatchObject({ statusCode: 403 })
    },
  )
})

describe('team subscription summary & auto-renew toggle', () => {
  it('returns the team subscription summary to an admin', async () => {
    asMember(TeamRole.ADMIN)
    await expect(getTeamSubscriptionSummary('u')).resolves.toMatchObject({
      paymentMethod: 'WALLET',
      autoRenew: false,
      status: 'ACTIVE',
    })
  })

  it('404s when the team has no subscription', async () => {
    asMember(TeamRole.OWNER, teamFor({ subscription: null }))
    await expect(getTeamSubscriptionSummary('u')).rejects.toMatchObject({
      statusCode: 404,
    })
    await expect(toggleTeamAutoRenew('u', true)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('flips only the flag — no Safepay call — and is admin-only', async () => {
    asMember(TeamRole.OWNER)
    db.subscription.update.mockResolvedValue({
      paymentMethod: 'WALLET',
      autoRenew: true,
      status: 'ACTIVE',
      currentPeriodEnd: null,
      gracePeriodEnd: null,
    })

    const result = await toggleTeamAutoRenew('u', true)

    expect(db.subscription.update).toHaveBeenCalledWith({
      where: { teamId: 'team-1' },
      data: { autoRenew: true },
    })
    expect(result.autoRenew).toBe(true)
    expect(initPaymentSession).not.toHaveBeenCalled()

    asMember(TeamRole.MEMBER)
    await expect(toggleTeamAutoRenew('u', false)).rejects.toMatchObject({
      statusCode: 403,
    })
  })
})
