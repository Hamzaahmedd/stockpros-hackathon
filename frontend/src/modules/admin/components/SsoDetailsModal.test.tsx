import { DomainAuthPolicy } from '@/modules/auth/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const service = vi.hoisted(() => ({ getTeamSso: vi.fn() }))
vi.mock('../services', () => ({ adminService: service }))

import type { AdminTeamSso } from '../types'
import { SsoDetailsModal } from './SsoDetailsModal'

const SSO: AdminTeamSso = {
  domain: 'fund.com',
  domainId: 'dom-1',
  teamId: 'team-1',
  authPolicy: DomainAuthPolicy.ANY,
  enabled: true,
  configured: true,
  idpEntityId: 'https://idp.example.com/entity',
  idpSsoUrl: 'https://idp.example.com/sso',
  certificateExpiresAt: '2126-01-01T00:00:00Z',
  testedAt: '2030-01-02T00:00:00Z',
  lastLoginAt: '2030-01-03T00:00:00Z',
  updatedByUserId: 'admin-1',
  activeSsoSessions: 7,
  recentActivity: [
    {
      id: 'a1',
      action: 'SAML_ENABLED',
      actorUserId: 'admin-1',
      metadata: null,
      createdAt: '2030-01-04T00:00:00Z',
    },
    {
      id: 'a2',
      action: 'SAML_DISABLED',
      actorUserId: 'staff-1',
      metadata: { byStaff: true },
      createdAt: '2030-01-05T00:00:00Z',
    },
  ],
}

const onDisable = vi.fn()
const onReset = vi.fn()
const onClose = vi.fn()

const renderModal = (canWrite = true) =>
  render(
    <SsoDetailsModal
      domain='fund.com'
      canWrite={canWrite}
      onDisable={onDisable}
      onReset={onReset}
      onClose={onClose}
    />,
  )

beforeEach(() => {
  vi.clearAllMocks()
  service.getTeamSso.mockResolvedValue(SSO)
})

describe('SsoDetailsModal', () => {
  it('shows the setup, live sessions and the recent trail', async () => {
    renderModal()

    expect(await screen.findByText('Configured')).toBeInTheDocument()
    expect(service.getTeamSso).toHaveBeenCalledWith('fund.com')
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByText('Tested')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(
      screen.getByText('https://idp.example.com/entity'),
    ).toBeInTheDocument()
    expect(screen.getByText('Saml enabled')).toBeInTheDocument()
    expect(screen.getByText('Saml disabled')).toBeInTheDocument()
    expect(screen.getAllByText('By staff')).toHaveLength(1)
  })

  it('marks a domain that requires SSO', async () => {
    service.getTeamSso.mockResolvedValue({
      ...SSO,
      authPolicy: DomainAuthPolicy.SAML_SSO,
    })

    renderModal()

    expect(await screen.findByText('Required for everyone')).toBeInTheDocument()
  })

  it('says when nothing has been recorded', async () => {
    service.getTeamSso.mockResolvedValue({ ...SSO, recentActivity: [] })

    renderModal()

    expect(await screen.findByText('Nothing recorded yet.')).toBeInTheDocument()
  })

  it('lets a platform admin disable or reset', async () => {
    renderModal(true)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Disable SSO' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Reset SSO setup' }),
    )

    expect(onDisable).toHaveBeenCalledTimes(1)
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('is read-only for support agents', async () => {
    renderModal(false)

    await screen.findByText('Configured')

    expect(
      screen.queryByRole('button', { name: 'Disable SSO' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Reset SSO setup' }),
    ).not.toBeInTheDocument()
  })

  it('offers only what applies: no disable when SSO is off, no reset when unconfigured', async () => {
    service.getTeamSso.mockResolvedValue({
      ...SSO,
      enabled: false,
      configured: false,
      idpEntityId: null,
      idpSsoUrl: null,
      testedAt: null,
    })

    renderModal()

    expect(await screen.findByText('Not configured')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Disable SSO' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Reset SSO setup' }),
    ).not.toBeInTheDocument()
  })

  it('lets staff disable a required domain even when its flag is already off', async () => {
    service.getTeamSso.mockResolvedValue({
      ...SSO,
      enabled: false,
      authPolicy: DomainAuthPolicy.SAML_SSO,
    })

    renderModal()

    expect(
      await screen.findByRole('button', { name: 'Disable SSO' }),
    ).toBeInTheDocument()
  })

  it('shows why when the details cannot be loaded', async () => {
    service.getTeamSso.mockRejectedValue({
      response: { data: { message: 'Domain not found' } },
    })

    renderModal()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Domain not found',
    )
  })

  it('closes', async () => {
    renderModal()
    await screen.findByText('Configured')

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalled()
  })
})
