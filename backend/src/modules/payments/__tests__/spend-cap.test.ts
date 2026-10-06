jest.mock('../../../shared/infrastructure/database', () => ({
  prisma: {
    user: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
  },
}))

jest.mock('../../../shared/infrastructure/team-access', () => ({
  getActiveMembership: jest.fn(),
}))

jest.mock('../../../shared/infrastructure/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('../usage', () => ({ getMyUsage: jest.fn() }))

import { TeamRole } from '@prisma/client'
import { prisma } from '../../../shared/infrastructure/database'
import { logger } from '../../../shared/infrastructure/logger'
import { getActiveMembership } from '../../../shared/infrastructure/team-access'
import { setSpendCap } from '../spend-cap'
import { getMyUsage } from '../usage'
import { spendCapValidator } from '../validation'
import {
  USER_SPEND_CAP_MAX_PAISA,
  USER_SPEND_CAP_MIN_PAISA,
} from '../constants'

const db = prisma as any

const asUser = (plan: string) =>
  db.user.findUniqueOrThrow.mockResolvedValue({ plan })

beforeEach(() => {
  jest.resetAllMocks()
  ;(getActiveMembership as jest.Mock).mockResolvedValue(null)
  ;(getMyUsage as jest.Mock).mockResolvedValue({ spendCap: null })
})

describe('setSpendCap', () => {
  it('stores the limit on the caller only and returns the refreshed usage summary', async () => {
    asUser('PRO')
    ;(getMyUsage as jest.Mock).mockResolvedValue({
      spendCap: { monthlyLimitPaisa: 50_000 },
    })

    const summary = await setSpendCap('user-1', 50_000)

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { monthlyCreditLimitPaisa: 50_000 },
    })
    expect(getMyUsage).toHaveBeenCalledWith('user-1')
    expect(summary).toEqual({ spendCap: { monthlyLimitPaisa: 50_000 } })
  })

  it('removes the limit with null', async () => {
    asUser('PRO')

    await setSpendCap('user-1', null)

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { monthlyCreditLimitPaisa: null },
    })
  })

  it('treats a stale TEAM plan without a workspace as an individual', async () => {
    asUser('TEAM')

    await setSpendCap('user-1', 20_000)

    expect(db.user.update).toHaveBeenCalled()
  })

  it('refuses FREE users, who have no credits to cap', async () => {
    asUser('FREE')

    await expect(setSpendCap('user-1', 20_000)).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it.each([TeamRole.MEMBER, TeamRole.ADMIN, TeamRole.OWNER])(
    'refuses a workspace %s: member limits are set by workspace admins',
    async (role) => {
      asUser('TEAM')
      ;(getActiveMembership as jest.Mock).mockResolvedValue({
        teamId: 'team-1',
        role,
        monthlyCreditLimitPaisa: null,
        orgInstructions: null,
      })

      await expect(setSpendCap('user-1', 20_000)).rejects.toMatchObject({
        statusCode: 403,
      })
      expect(db.user.update).not.toHaveBeenCalled()
    },
  )

  it('logs the change by user id only, never the amount or any personal data', async () => {
    asUser('PRO')

    await setSpendCap('user-1', 12_345)

    const message = (logger.info as jest.Mock).mock.calls[0][0] as string
    expect(message).toContain('user=user-1')
    expect(message).not.toContain('12345')
    expect(message).not.toContain('12_345')
  })
})

describe('spendCapValidator', () => {
  const parse = (value: unknown) =>
    spendCapValidator.safeParse({ monthlyLimitPaisa: value })

  it('accepts null (remove) and anything from one signal to the maximum', () => {
    expect(parse(null).success).toBe(true)
    expect(parse(USER_SPEND_CAP_MIN_PAISA).success).toBe(true)
    expect(parse(USER_SPEND_CAP_MAX_PAISA).success).toBe(true)
  })

  it.each([
    ['below one signal', USER_SPEND_CAP_MIN_PAISA - 1],
    ['zero', 0],
    ['negative', -5_000],
    ['above the maximum', USER_SPEND_CAP_MAX_PAISA + 1],
    ['a fraction of a paisa', 5_000.5],
    ['a string', '5000'],
    ['NaN', Number.NaN],
  ])('rejects %s', (_label, value) => {
    expect(parse(value).success).toBe(false)
  })

  it('requires the field, so an empty body cannot silently mean "remove the limit"', () => {
    expect(spendCapValidator.safeParse({}).success).toBe(false)
  })
})
