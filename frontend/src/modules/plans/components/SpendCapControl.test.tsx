import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageSummary } from '../types'

const service = vi.hoisted(() => ({ setSpendCap: vi.fn() }))
vi.mock('../services', () => ({ usageService: service }))

import { SpendCapControl } from './SpendCapControl'

const summary = (overrides: Partial<UsageSummary> = {}): UsageSummary => ({
  plan: 'PRO',
  metered: true,
  quota: {
    limit: 300,
    used: 300,
    remaining: 0,
    windowStart: '2030-09-10T00:00:00.000Z',
    windowEnd: '2030-10-10T00:00:00.000Z',
    windowSource: 'SUBSCRIPTION_PERIOD',
  },
  credits: {
    pool: 'USER',
    balanceInPaisa: 95_000,
    costPerSignalPaisa: 5_000,
    signalsAvailable: 19,
    canTopUp: true,
    canSetSpendCap: true,
  },
  spendCap: null,
  ...overrides,
})

const capped = (spentPaisa: number, limit = 20_000): UsageSummary =>
  summary({
    spendCap: {
      monthlyLimitPaisa: limit,
      spentPaisa,
      remainingPaisa: Math.max(limit - spentPaisa, 0),
    },
  })

beforeEach(() => {
  vi.clearAllMocks()
  service.setSpendCap.mockResolvedValue(capped(0, 50_000))
})

describe('SpendCapControl', () => {
  it('lets an individual Pro user set a limit, sending whole paisa and reporting the refreshed summary', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    render(<SpendCapControl usage={summary()} onChanged={onChanged} />)

    await user.type(screen.getByLabelText(/Limit per cycle/), '500')
    await user.click(screen.getByRole('button', { name: 'Save limit' }))

    expect(service.setSpendCap).toHaveBeenCalledWith(50_000)
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(capped(0, 50_000)),
    )
    expect(
      screen.queryByRole('button', { name: 'Remove limit' }),
    ).not.toBeInTheDocument()
  })

  it('shows the current limit prefilled with what has been spent and what is left', () => {
    render(<SpendCapControl usage={capped(15_000)} onChanged={vi.fn()} />)

    expect(screen.getByLabelText(/Limit per cycle/)).toHaveValue(200)
    expect(screen.getByTestId('spend-cap-status')).toHaveTextContent(
      'Rs 150 of Rs 200 used this cycle (Rs 50 left).',
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('warns that paid signals are paused once less than one signal is left', () => {
    render(<SpendCapControl usage={capped(18_000)} onChanged={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'paid AI signals are paused',
    )
  })

  it('removes the limit with null', async () => {
    const user = userEvent.setup()
    render(<SpendCapControl usage={capped(0)} onChanged={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Remove limit' }))

    expect(service.setSpendCap).toHaveBeenCalledWith(null)
  })

  it.each(['', 'abc', '10', '200000'])(
    'refuses %j before calling the API (outside Rs 50 – Rs 100,000)',
    async (value) => {
      const user = userEvent.setup()
      render(<SpendCapControl usage={summary()} onChanged={vi.fn()} />)

      if (value)
        await user.type(screen.getByLabelText(/Limit per cycle/), value)
      await user.click(screen.getByRole('button', { name: 'Save limit' }))

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Enter an amount between Rs 50 and Rs 100,000.',
      )
      expect(service.setSpendCap).not.toHaveBeenCalled()
    },
  )

  it('shows the server message when saving fails and keeps the form usable', async () => {
    const user = userEvent.setup()
    service.setSpendCap.mockRejectedValue({
      response: { data: { message: 'Not allowed' } },
    })
    render(<SpendCapControl usage={summary()} onChanged={vi.fn()} />)

    await user.type(screen.getByLabelText(/Limit per cycle/), '500')
    await user.click(screen.getByRole('button', { name: 'Save limit' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed')
    expect(screen.getByRole('button', { name: 'Save limit' })).toBeEnabled()
  })

  it.each([
    [
      'a workspace member (their admin sets it)',
      summary({
        credits: { ...summary().credits!, canSetSpendCap: false },
      }),
    ],
    [
      'a Free user',
      summary({ plan: 'FREE', metered: false, quota: null, credits: null }),
    ],
  ])('renders nothing for %s', (_label, usage) => {
    const { container } = render(
      <SpendCapControl usage={usage} onChanged={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
