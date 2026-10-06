import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageSummary } from '../types'

const service = vi.hoisted(() => ({ setAlertsEnabled: vi.fn() }))
vi.mock('../services', () => ({ usageService: service }))

import { UsageAlertsToggle } from './UsageAlertsToggle'

const summary = (overrides: Partial<UsageSummary> = {}): UsageSummary => ({
  plan: 'PRO',
  metered: true,
  quota: null,
  credits: {
    pool: 'USER',
    balanceInPaisa: 95_000,
    costPerSignalPaisa: 5_000,
    signalsAvailable: 19,
    canTopUp: true,
    canSetSpendCap: true,
  },
  alertsEnabled: true,
  spendCap: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  service.setAlertsEnabled.mockResolvedValue(summary({ alertsEnabled: false }))
})

describe('UsageAlertsToggle', () => {
  it('reflects the saved preference', () => {
    const { rerender } = render(
      <UsageAlertsToggle usage={summary()} onChanged={vi.fn()} />,
    )
    expect(screen.getByRole('switch')).toBeChecked()

    rerender(
      <UsageAlertsToggle
        usage={summary({ alertsEnabled: false })}
        onChanged={vi.fn()}
      />,
    )
    expect(screen.getByRole('switch')).not.toBeChecked()
  })

  it('names what the emails cover', () => {
    render(<UsageAlertsToggle usage={summary()} onChanged={vi.fn()} />)
    expect(
      screen.getByRole('switch', { name: 'Email me before I hit a limit' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/80% and 100%/)).toBeInTheDocument()
  })

  it('turns the alerts off and reports the refreshed summary', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    render(<UsageAlertsToggle usage={summary()} onChanged={onChanged} />)

    await user.click(screen.getByRole('switch'))

    expect(service.setAlertsEnabled).toHaveBeenCalledWith(false)
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(summary({ alertsEnabled: false })),
    )
  })

  it('turns them back on', async () => {
    const user = userEvent.setup()
    service.setAlertsEnabled.mockResolvedValue(summary())
    render(
      <UsageAlertsToggle
        usage={summary({ alertsEnabled: false })}
        onChanged={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('switch'))

    expect(service.setAlertsEnabled).toHaveBeenCalledWith(true)
  })

  it('shows why a change failed and leaves the switch usable', async () => {
    const user = userEvent.setup()
    service.setAlertsEnabled.mockRejectedValue({
      response: { data: { message: 'Try later' } },
    })
    render(<UsageAlertsToggle usage={summary()} onChanged={vi.fn()} />)

    await user.click(screen.getByRole('switch'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Try later')
    expect(screen.getByRole('switch')).toBeEnabled()
  })

  it.each([
    [
      'a workspace member (not emailed yet)',
      summary({ credits: { ...summary().credits!, canSetSpendCap: false } }),
    ],
    [
      'a Free user',
      summary({ plan: 'FREE', metered: false, quota: null, credits: null }),
    ],
  ])('renders nothing for %s', (_label, usage) => {
    const { container } = render(
      <UsageAlertsToggle usage={usage} onChanged={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
