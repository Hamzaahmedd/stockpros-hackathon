import type { PlatformRole } from '@/modules/auth/types'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminUser } from '../types'

const service = vi.hoisted(() => ({
  searchUsers: vi.fn(),
  overridePlan: vi.fn(),
  invalidateSessions: vi.fn(),
  getUserUsage: vi.fn(),
}))
vi.mock('../services', () => ({ adminService: service }))
vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { UsersTab } from './UsersTab'

const USER: AdminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Sam Lee',
  email: 'sam@fund.com',
  status: 'ACTIVE',
  plan: 'PRO',
  platformRole: 'USER',
  creditBalanceInPaisa: 250_000,
  monthlyCreditLimitPaisa: null,
  usageAlertsEnabled: true,
  activeSessions: 2,
  deletedAt: null,
  piiMasked: false,
  subscription: null,
  team: null,
}

const search = async () => {
  await userEvent.type(screen.getByLabelText('Search users'), 'sam')
  await userEvent.click(screen.getByRole('button', { name: 'Search' }))
  await screen.findByText('sam@fund.com')
}

const renderAs = (role: PlatformRole) => render(<UsersTab role={role} />)

beforeEach(() => {
  vi.clearAllMocks()
  service.searchUsers.mockResolvedValue([USER])
  service.overridePlan.mockResolvedValue(undefined)
  service.getUserUsage.mockResolvedValue({
    userId: USER.id,
    plan: 'PRO',
    metered: true,
    quota: {
      limit: 300,
      used: 12,
      remaining: 288,
      windowStart: '2026-10-01T00:00:00Z',
      windowEnd: '2026-11-01T00:00:00Z',
      windowSource: 'CALENDAR_MONTH',
    },
    credits: {
      pool: 'USER',
      balanceInPaisa: 250_000,
      costPerSignalPaisa: 100,
      signalsAvailable: 2_500,
      canTopUp: true,
      canSetSpendCap: true,
    },
    alertsEnabled: true,
    spendCap: null,
    blockedReason: null,
  })
})

describe('UsersTab', () => {
  it('searches and shows plan, credits and active sessions', async () => {
    renderAs('SUPPORT_AGENT')
    await search()

    expect(service.searchUsers).toHaveBeenCalledWith('sam')
    expect(screen.getByText('PRO')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('opens the spend-limit card for support, read-only', async () => {
    renderAs('SUPPORT_AGENT')
    await search()

    await userEvent.click(screen.getByRole('button', { name: 'Spend limit' }))

    expect(await screen.findByText('12 / 300')).toBeInTheDocument()
    expect(service.getUserUsage).toHaveBeenCalledWith(USER.id)
    expect(
      screen.queryByRole('button', { name: 'Change limit' }),
    ).not.toBeInTheDocument()
  })

  it('lets a platform admin change the limit from the card', async () => {
    renderAs('PLATFORM_ADMIN')
    await search()

    await userEvent.click(screen.getByRole('button', { name: 'Spend limit' }))

    expect(
      await screen.findByRole('button', { name: 'Change limit' }),
    ).toBeInTheDocument()
  })

  it.each<PlatformRole>(['SUPPORT_AGENT', 'PLATFORM_ADMIN'])(
    'gives %s no write actions',
    async (role) => {
      renderAs(role)
      await search()
      expect(
        screen.queryByRole('button', { name: 'Change plan' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Revoke sessions' }),
      ).not.toBeInTheDocument()
    },
  )

  it('lets a super admin override a plan with an audited reason', async () => {
    renderAs('SUPER_ADMIN')
    await search()

    await userEvent.click(screen.getByRole('button', { name: 'Change plan' }))
    await userEvent.selectOptions(screen.getByLabelText('New plan'), 'TEAM')
    await userEvent.type(
      screen.getByLabelText('Reason (audited)'),
      'Enterprise pilot approved by sales',
    )
    await userEvent.type(screen.getByLabelText('Support ticket'), 'SUP-77')
    await userEvent.click(screen.getByRole('button', { name: 'Override plan' }))

    await waitFor(() =>
      expect(service.overridePlan).toHaveBeenCalledWith(
        USER.id,
        'TEAM',
        'Enterprise pilot approved by sales',
        'SUP-77',
      ),
    )
    // The list is refreshed after a successful write.
    await waitFor(() => expect(service.searchUsers).toHaveBeenCalledTimes(2))
  })

  it('says so when nothing matches', async () => {
    service.searchUsers.mockResolvedValue([])
    renderAs('SUPPORT_AGENT')
    await userEvent.type(screen.getByLabelText('Search users'), 'zz')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText(/No users match/)).toBeInTheDocument()
  })
})
