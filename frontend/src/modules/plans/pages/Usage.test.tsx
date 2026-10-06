import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageHistory } from '../types'

const service = vi.hoisted(() => ({ getHistory: vi.fn() }))
vi.mock('../services', () => ({ usageService: service }))
vi.mock('@/shared/components/Sidebar', () => ({ Sidebar: () => null }))
// jsdom has no ResizeObserver or layout, so recharts cannot draw; the numbers
// are asserted through the table view that sits next to the chart.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: unknown }) => <>{children}</>,
  BarChart: () => null,
  Bar: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}))
vi.mock('../components/QuotaMeter', () => ({
  QuotaMeter: ({ showDetailsLink }: { showDetailsLink?: boolean }) => (
    <div data-testid='quota-meter' data-link={String(showDetailsLink)} />
  ),
}))
vi.mock('../components/CreditLedgerPanel', () => ({
  CreditLedgerPanel: ({ scope }: { scope: string }) => (
    <div data-testid='ledger' data-scope={scope} />
  ),
}))

import Usage from './Usage'

const day = (date: string, signals = 0, creditSpentPaisa = 0) => ({
  date,
  signals,
  creditSpentPaisa,
})

const history = (overrides: Partial<UsageHistory> = {}): UsageHistory => ({
  plan: 'PRO',
  metered: true,
  scope: 'USER',
  range: 'current',
  timezone: 'UTC',
  window: {
    start: '2030-09-10T00:00:00.000Z',
    end: '2030-10-10T00:00:00.000Z',
    source: 'SUBSCRIPTION_PERIOD',
  },
  totals: { signals: 7, creditSpentPaisa: 10_000 },
  daily: [
    day('2030-09-10', 5, 10_000),
    day('2030-09-11'),
    day('2030-09-12', 2),
  ],
  byFeature: [
    { feature: 'ai_forecast', signals: 5, creditSpentPaisa: 0 },
    { feature: 'ai_decision', signals: 2, creditSpentPaisa: 10_000 },
  ],
  ...overrides,
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <Usage />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  service.getHistory.mockResolvedValue(history())
})

describe('Usage page', () => {
  it('loads the current cycle and shows totals, the cycle span and the reset date', async () => {
    renderPage()

    expect(await screen.findByTestId('history-signals')).toHaveTextContent('7')
    expect(screen.getByTestId('history-credit-spend')).toHaveTextContent(
      'Rs 100',
    )
    expect(service.getHistory).toHaveBeenCalledWith('current')
    expect(screen.getByText(/Sep 10 – Sep 12/)).toBeInTheDocument()
    expect(screen.getByTestId('history-reset')).toHaveTextContent(
      /Resets Oct 10/,
    )
  })

  it('hides the meter’s own "Usage details" link on this page', async () => {
    renderPage()
    expect((await screen.findByTestId('quota-meter')).dataset.link).toBe(
      'false',
    )
  })

  it('lists every day in the table view, including zero days', async () => {
    renderPage()
    await screen.findByTestId('history-signals')

    const rows = screen.getAllByRole('row')
    // header + one row per day
    expect(rows).toHaveLength(4)
    expect(within(rows[2]).getByText('Sep 11')).toBeInTheDocument()
    expect(within(rows[2]).getAllByText('0')).not.toHaveLength(0)
  })

  it('breaks usage down by feature with credit spend where there is some', async () => {
    renderPage()
    await screen.findByTestId('history-signals')

    expect(screen.getByText('AI forecast')).toBeInTheDocument()
    expect(screen.getByText('5 signals')).toBeInTheDocument()
    expect(screen.getByText('Market decision')).toBeInTheDocument()
    expect(screen.getByText(/2 signals · Rs 100 credits/)).toBeInTheDocument()
  })

  it('switches to the previous cycle and drops the reset note', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('history-signals')

    service.getHistory.mockResolvedValue(
      history({
        range: 'previous',
        totals: { signals: 1, creditSpentPaisa: 0 },
        daily: [day('2030-08-11', 1)],
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Previous cycle' }))

    await waitFor(() =>
      expect(service.getHistory).toHaveBeenLastCalledWith('previous'),
    )
    expect(await screen.findByTestId('history-signals')).toHaveTextContent('1')
    expect(screen.queryByTestId('history-reset')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Previous cycle' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the whole workspace and its ledger to an owner/admin', async () => {
    service.getHistory.mockResolvedValue(history({ scope: 'TEAM' }))
    renderPage()

    expect(await screen.findByText(/Everyone in your workspace/)).toBeVisible()
    expect(screen.getByTestId('ledger').dataset.scope).toBe('TEAM')
  })

  it('shows an individual their own usage and personal ledger', async () => {
    renderPage()

    expect(await screen.findByText(/Your own usage/)).toBeVisible()
    expect(screen.getByTestId('ledger').dataset.scope).toBe('USER')
  })

  it('tells a Free user there is no history instead of an empty chart', async () => {
    service.getHistory.mockResolvedValue(
      history({
        plan: 'FREE',
        metered: false,
        scope: null,
        window: null,
        daily: [],
      }),
    )
    renderPage()

    expect(await screen.findByText(/daily limits/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute(
      'href',
      '/plans',
    )
    expect(screen.queryByTestId('history-signals')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ledger')).not.toBeInTheDocument()
  })

  it('reports a billing period that has already ended', async () => {
    service.getHistory.mockResolvedValue(
      history({
        window: {
          start: '2020-01-01T00:00:00.000Z',
          end: '2020-01-31T00:00:00.000Z',
          source: 'SUBSCRIPTION_PERIOD',
        },
      }),
    )
    renderPage()

    expect(await screen.findByTestId('history-reset')).toHaveTextContent(
      /Billing period ended/,
    )
  })

  it('shows an error with a retry that reloads', async () => {
    const user = userEvent.setup()
    service.getHistory.mockRejectedValueOnce(new Error('network'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load your usage history",
    )
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByTestId('history-signals')).toHaveTextContent('7')
    expect(service.getHistory).toHaveBeenCalledTimes(2)
  })
})
