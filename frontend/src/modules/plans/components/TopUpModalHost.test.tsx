import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/modules/auth/hooks/useAuth', () => ({
  useAuth: () => ({ enablePaymentProcessor: true }),
}))
vi.mock('../services', () => ({ subscriptionService: {} }))

import {
  dispatchOverageRequired,
  type OverageReason,
} from '@/shared/utils/overage-events'
import { TopUpModalHost } from './TopUpModalHost'

const overage = (reason: OverageReason) =>
  act(() =>
    dispatchOverageRequired({
      code: 'OVERAGE_REQUIRED',
      reason,
      feature: 'ai_forecast',
      canTopUp: true,
    }),
  )

const renderHost = () =>
  render(
    <MemoryRouter>
      <TopUpModalHost />
    </MemoryRouter>,
  )

describe('TopUpModalHost', () => {
  it('renders nothing until an overage event arrives', () => {
    renderHost()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers credit packs when the balance cannot cover a signal', () => {
    renderHost()
    overage('INSUFFICIENT_CREDITS')

    expect(screen.getByRole('dialog')).toHaveTextContent('Top up credits')
    expect(screen.getByRole('dialog')).toHaveTextContent(
      "credit balance can't cover another signal",
    )
  })

  it("says the workspace admin's limit stopped a member", () => {
    renderHost()
    overage('SPEND_LIMIT_REACHED')

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'set by your workspace admin',
    )
  })

  it("points to the usage page, not a top-up, when the user's own limit stopped them", () => {
    renderHost()
    overage('PERSONAL_SPEND_LIMIT_REACHED')

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Spending limit reached')
    expect(dialog).toHaveTextContent(
      'the monthly credit spending limit you set',
    )
    expect(dialog).not.toHaveTextContent('Top up credits')
    expect(
      screen.getByRole('link', { name: 'Review your limit' }),
    ).toHaveAttribute('href', '/usage')
  })
})
