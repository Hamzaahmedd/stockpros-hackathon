import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminPage, CreditLedgerEntry } from '../types'

const service = vi.hoisted(() => ({ listCreditLedger: vi.fn() }))
vi.mock('../services', () => ({ adminService: service }))
vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { CreditLedgerSection } from './CreditLedgerSection'

const USER = '0191e4a0-0000-7000-8000-0000000000bb'

const entry = (
  overrides: Partial<CreditLedgerEntry> = {},
): CreditLedgerEntry => ({
  id: 'l1',
  userId: USER,
  teamId: null,
  amountPaisa: -40_000,
  type: 'OVERAGE_CONSUMPTION',
  description: 'AI forecast overage',
  createdAt: '2026-01-01T10:00:00.000Z',
  ...overrides,
})

const pageOf = (
  items: CreditLedgerEntry[],
  total = items.length,
): AdminPage<CreditLedgerEntry> => ({
  items,
  total,
  page: 1,
  limit: 25,
})

beforeEach(() => {
  vi.clearAllMocks()
  service.listCreditLedger.mockResolvedValue(pageOf([entry()]))
})

describe('CreditLedgerSection', () => {
  it('loads the whole ledger first and shows type, amount, pool and description', async () => {
    render(<CreditLedgerSection />)

    expect(await screen.findByText('AI forecast overage')).toBeInTheDocument()
    expect(service.listCreditLedger).toHaveBeenCalledWith(
      { userId: undefined, teamId: undefined, type: undefined },
      1,
    )
    // The type name also appears as a filter option, so look inside the table.
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Overage consumption')).toBeInTheDocument()
    expect(table.getByText(`user ${USER}`)).toBeInTheDocument()
  })

  it('labels team-pool movements by team', async () => {
    service.listCreditLedger.mockResolvedValue(
      pageOf([
        entry({
          userId: null,
          teamId: 'team-9',
          type: 'PURCHASE',
          amountPaisa: 500_000,
        }),
      ]),
    )
    render(<CreditLedgerSection />)
    expect(await screen.findByText('team team-9')).toBeInTheDocument()
  })

  it('filters by movement type and returns to the first page', async () => {
    render(<CreditLedgerSection />)
    await screen.findByText('AI forecast overage')

    await userEvent.selectOptions(
      screen.getByLabelText('Ledger type'),
      'REFUND',
    )

    await waitFor(() =>
      expect(service.listCreditLedger).toHaveBeenLastCalledWith(
        { userId: undefined, teamId: undefined, type: 'REFUND' },
        1,
      ),
    )
  })

  it('does not query with a malformed id', async () => {
    render(<CreditLedgerSection />)
    await screen.findByText('AI forecast overage')
    service.listCreditLedger.mockClear()

    await userEvent.type(screen.getByLabelText('Ledger user ID'), 'not-a-uuid')

    expect(service.listCreditLedger).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Ledger user ID')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('says so when nothing matches', async () => {
    service.listCreditLedger.mockResolvedValue(pageOf([]))
    render(<CreditLedgerSection />)
    expect(
      await screen.findByText('No credit movements found.'),
    ).toBeInTheDocument()
  })
})
