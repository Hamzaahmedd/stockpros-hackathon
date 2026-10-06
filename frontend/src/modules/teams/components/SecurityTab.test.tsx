import { DomainAuthPolicy } from '@/modules/auth/types'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const service = vi.hoisted(() => ({ setDomainAuthPolicy: vi.fn() }))
const toasts = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('../services', () => ({ teamService: service }))
vi.mock('react-toastify', () => ({ toast: toasts }))
// The panel has its own tests; here it only reports whether SSO is ready.
vi.mock('./SsoPanel', () => ({
  SsoPanel: ({
    domain,
    onConfigChange,
  }: {
    domain: { domain: string }
    onConfigChange: (domain: string, config: unknown) => void
  }) => (
    <button
      type='button'
      onClick={() =>
        onConfigChange(domain.domain, {
          enabled: true,
          testedAt: '2030-01-01T00:00:00Z',
        })
      }
    >
      report SSO ready for {domain.domain}
    </button>
  ),
}))

import type { Team, TeamDomain } from '../types'
import { SecurityTab } from './SecurityTab'

const domain = (overrides: Partial<TeamDomain> = {}): TeamDomain => ({
  id: 'd-1',
  domain: 'fund.com',
  isVerified: true,
  restrictOrgCreation: true,
  joinPolicy: 'INVITE_ONLY' as TeamDomain['joinPolicy'],
  authPolicy: DomainAuthPolicy.ANY,
  ...overrides,
})

const team = (role: Team['role'], domains: TeamDomain[] = [domain()]) =>
  ({ role, domains }) as unknown as Team

const reload = vi.fn()

const Location = () => <p data-testid='search'>{useLocation().search}</p>

const renderTab = (t: Team, path = '/teams') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SecurityTab team={t} reload={reload} />
      <Location />
    </MemoryRouter>,
  )

const optionsOf = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('who can change what', () => {
  it('lets the owner choose the sign-in method', () => {
    renderTab(team('OWNER'))

    expect(screen.getByLabelText('Sign-in method for fund.com')).toBeEnabled()
  })

  it('shows an admin the policy read-only, with the reason', () => {
    renderTab(team('ADMIN'))

    expect(screen.getByLabelText('Sign-in method for fund.com')).toBeDisabled()
    expect(
      screen.getByText(/only the workspace owner can change this/i),
    ).toBeInTheDocument()
  })

  it.each(['OWNER', 'ADMIN'] as const)('gives the %s the SSO setup', (role) => {
    renderTab(team(role))

    expect(
      screen.getByRole('button', { name: /report SSO ready for fund.com/i }),
    ).toBeInTheDocument()
  })

  it('offers SSO setup only for verified domains', () => {
    renderTab(team('OWNER', [domain({ isVerified: false })]))

    expect(
      screen.queryByText(/single sign-on \(saml\)/i),
    ).not.toBeInTheDocument()
  })

  it('does not offer SSO setup to a plain member', () => {
    renderTab(team('MEMBER'))

    expect(
      screen.queryByText(/single sign-on \(saml\)/i),
    ).not.toBeInTheDocument()
  })
})

describe('requiring SSO', () => {
  it('hides the SSO option until SSO is enabled and tested', async () => {
    renderTab(team('OWNER'))
    const select = screen.getByLabelText('Sign-in method for fund.com')
    expect(optionsOf(select)).not.toContain(DomainAuthPolicy.SAML_SSO)

    await userEvent.click(
      screen.getByRole('button', { name: /report SSO ready for fund.com/i }),
    )

    expect(optionsOf(select)).toContain(DomainAuthPolicy.SAML_SSO)
  })

  it('keeps the option for a domain that already requires it', () => {
    renderTab(
      team('OWNER', [domain({ authPolicy: DomainAuthPolicy.SAML_SSO })]),
    )

    expect(
      optionsOf(screen.getByLabelText('Sign-in method for fund.com')),
    ).toContain(DomainAuthPolicy.SAML_SSO)
  })

  it('explains the SSO lockout risk and needs the domain typed back', async () => {
    service.setDomainAuthPolicy.mockResolvedValue({
      ...domain(),
      authPolicy: DomainAuthPolicy.SAML_SSO,
      revokedSessions: 4,
    })
    renderTab(team('OWNER'))
    await userEvent.click(
      screen.getByRole('button', { name: /report SSO ready for fund.com/i }),
    )

    await userEvent.selectOptions(
      screen.getByLabelText('Sign-in method for fund.com'),
      DomainAuthPolicy.SAML_SSO,
    )

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('passed the SSO test yourself')
    expect(dialog).not.toHaveTextContent('signed in with Google yourself')
    const confirm = within(dialog).getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()

    await userEvent.type(
      within(dialog).getByLabelText('Type fund.com to confirm'),
      'fund.com',
    )
    await userEvent.click(confirm)

    await waitFor(() =>
      expect(service.setDomainAuthPolicy).toHaveBeenCalledWith(
        'fund.com',
        DomainAuthPolicy.SAML_SSO,
        'fund.com',
      ),
    )
    expect(reload).toHaveBeenCalled()
  })

  it('keeps the Google wording for the Google policies', async () => {
    renderTab(team('OWNER'))

    await userEvent.selectOptions(
      screen.getByLabelText('Sign-in method for fund.com'),
      DomainAuthPolicy.GOOGLE_ONLY,
    )

    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'signed in with Google yourself',
    )
  })

  it('shows the server’s refusal', async () => {
    service.setDomainAuthPolicy.mockRejectedValue({
      response: { data: { message: 'Complete a successful test first' } },
    })
    renderTab(
      team('OWNER', [domain({ authPolicy: DomainAuthPolicy.SAML_SSO })]),
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Sign-in method for fund.com'),
      DomainAuthPolicy.ANY,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith(
        'Complete a successful test first',
      ),
    )
  })
})

describe('returning from the SSO test', () => {
  it('reports a passing test once and clears the parameter', async () => {
    renderTab(team('OWNER'), '/settings/workspace/security?sso_test=passed')

    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith(
        'SSO test passed. You can now enable SSO.',
      ),
    )
    expect(screen.getByTestId('search')).toHaveTextContent('')
    expect(toasts.success).toHaveBeenCalledTimes(1)
  })

  it('reports a failed test', async () => {
    renderTab(team('OWNER'), '/settings/workspace/security?sso_test=failed')

    await waitFor(() => expect(toasts.error).toHaveBeenCalled())
    expect(screen.getByTestId('search')).toHaveTextContent('')
  })

  it('says nothing on an ordinary visit', () => {
    renderTab(team('OWNER'))

    expect(toasts.success).not.toHaveBeenCalled()
    expect(toasts.error).not.toHaveBeenCalled()
  })
})
