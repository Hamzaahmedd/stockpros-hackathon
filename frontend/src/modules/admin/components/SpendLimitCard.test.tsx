import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminUser, AdminUserUsage } from '../types'

const service = vi.hoisted(() => ({
  getUserUsage: vi.fn(),
  setSpendLimit: vi.fn(),
}))
vi.mock('../services', () => ({ adminService: service }))
vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { SpendLimitCard } from './SpendLimitCard'

const USER: AdminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Sam Lee',
  email: 'sam@fund.com',
  status: 'ACTIVE',
  plan: 'PRO',
  platformRole: 'USER',
  creditBalanceInPaisa: 250_000,
  monthlyCreditLimitPaisa: 50_000,
  usageAlertsEnabled: true,
  activeSessions: 1,
  deletedAt: null,
  piiMasked: false,
  subscription: null,
  team: null,
}

const USAGE: AdminUserUsage = {
  userId: USER.id,
  plan: 'PRO',
  metered: true,
  quota: {
    limit: 300,
    used: 300,
    remaining: 0,
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
  spendCap: {
    monthlyLimitPaisa: 50_000,
    spentPaisa: 49_950,
    remainingPaisa: 50,
  },
  blockedReason: 'PERSONAL_SPEND_LIMIT_REACHED',
}

const renderCard = (
  overrides: Partial<{ user: AdminUser; canOverride: boolean }> = {},
) => {
  const onChanged = vi.fn()
  render(
    <SpendLimitCard
      user={overrides.user ?? USER}
      canOverride={overrides.canOverride ?? true}
      onClose={vi.fn()}
      onChanged={onChanged}
    />,
  )
  return { onChanged }
}

beforeEach(() => {
  vi.clearAllMocks()
  service.getUserUsage.mockResolvedValue(USAGE)
  service.setSpendLimit.mockResolvedValue(undefined)
})

describe('SpendLimitCard', () => {
  it('shows the limit, spend, balance and why usage is blocked', async () => {
    renderCard()

    expect(
      await screen.findByText(/Usage blocked: Own spending limit reached/),
    ).toBeInTheDocument()
    expect(service.getUserUsage).toHaveBeenCalledWith(USER.id)
    expect(screen.getByText('300 / 300')).toBeInTheDocument()
    expect(screen.getByText('Rs 500')).toBeInTheDocument()
    expect(screen.getByText('Rs 499.5')).toBeInTheDocument()
    expect(screen.getByText('Rs 2,500')).toBeInTheDocument()
    expect(screen.getByText('On')).toBeInTheDocument()
  })

  it('shows no block badge and "No limit" for an uncapped customer', async () => {
    service.getUserUsage.mockResolvedValue({
      ...USAGE,
      spendCap: null,
      blockedReason: null,
    })
    renderCard()

    expect(await screen.findByText('No limit')).toBeInTheDocument()
    expect(screen.queryByText(/Usage blocked/)).not.toBeInTheDocument()
  })

  it('explains that a FREE plan has no meter', async () => {
    service.getUserUsage.mockResolvedValue({
      ...USAGE,
      plan: 'FREE',
      metered: false,
      quota: null,
      credits: null,
      spendCap: null,
      blockedReason: null,
    })
    renderCard({ user: { ...USER, plan: 'FREE' } })

    expect(await screen.findByText(/Free plan: daily/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Change limit' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/no credits to limit/)).toBeInTheDocument()
  })

  it('hides the change control from staff who cannot override', async () => {
    renderCard({ canOverride: false })
    await screen.findByText('300 / 300')

    expect(
      screen.queryByRole('button', { name: 'Change limit' }),
    ).not.toBeInTheDocument()
  })

  it('points workspace members at their workspace admin instead of offering an override', async () => {
    renderCard({
      user: { ...USER, plan: 'TEAM', team: { teamId: 't1', role: 'MEMBER' } },
    })
    await screen.findByText('300 / 300')

    expect(
      screen.queryByRole('button', { name: 'Change limit' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/set by a workspace admin/)).toBeInTheDocument()
  })

  it('saves a new limit in paisa with an audited reason and a required ticket', async () => {
    const { onChanged } = renderCard()
    await screen.findByText('300 / 300')

    await userEvent.click(screen.getByRole('button', { name: 'Change limit' }))
    const limit = screen.getByLabelText('Monthly limit (Rs)')
    expect(limit).toHaveValue('500')
    await userEvent.clear(limit)
    await userEvent.type(limit, '1200')
    await userEvent.type(
      screen.getByLabelText('Reason (audited)'),
      'Customer asked support to raise it',
    )

    const save = screen.getByRole('button', { name: 'Save limit' })
    expect(save).toBeDisabled() // ticket still missing
    await userEvent.type(screen.getByLabelText('Support ticket'), 'sup-4821')
    await userEvent.click(save)

    await waitFor(() =>
      expect(service.setSpendLimit).toHaveBeenCalledWith(
        USER.id,
        120_000,
        'Customer asked support to raise it',
        'SUP-4821',
      ),
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('removes the limit with null', async () => {
    renderCard()
    await screen.findByText('300 / 300')

    await userEvent.click(screen.getByRole('button', { name: 'Change limit' }))
    await userEvent.click(screen.getByLabelText('Remove the limit'))
    await userEvent.type(
      screen.getByLabelText('Reason (audited)'),
      'Customer asked support to remove it',
    )
    await userEvent.type(screen.getByLabelText('Support ticket'), 'SUP-9')
    await userEvent.click(screen.getByRole('button', { name: 'Save limit' }))

    await waitFor(() =>
      expect(service.setSpendLimit).toHaveBeenCalledWith(
        USER.id,
        null,
        'Customer asked support to remove it',
        'SUP-9',
      ),
    )
  })

  it('refuses an amount outside the allowed range', async () => {
    renderCard()
    await screen.findByText('300 / 300')

    await userEvent.click(screen.getByRole('button', { name: 'Change limit' }))
    const limit = screen.getByLabelText('Monthly limit (Rs)')
    await userEvent.clear(limit)
    await userEvent.type(limit, '0.5')
    await userEvent.type(
      screen.getByLabelText('Reason (audited)'),
      'Customer asked support to change it',
    )
    await userEvent.type(screen.getByLabelText('Support ticket'), 'SUP-9')

    expect(screen.getByRole('button', { name: 'Save limit' })).toBeDisabled()
  })
})
