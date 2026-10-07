import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActiveSessionsPanel } from './ActiveSessionsPanel'

const services = vi.hoisted(() => ({
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
}))
vi.mock('../services', () => services)
vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const NOW = '2026-10-07T07:12:00.000Z'
const session = (id: string, isCurrent: boolean) => ({
  id,
  device: isCurrent ? 'Chrome (Windows)' : 'Safari (iOS)',
  location: isCurrent ? 'Karachi, Sindh, PK' : null,
  createdAt: NOW,
  updatedAt: NOW,
  isCurrent,
})

describe('ActiveSessionsPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists sessions, marks the current one and gives it no revoke button', async () => {
    services.listSessions.mockResolvedValue([
      session('a', true),
      session('b', false),
    ])
    render(<ActiveSessionsPanel />)

    expect(await screen.findByText('Chrome (Windows)')).toBeInTheDocument()
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.getByText('Karachi, Sindh, PK')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1)
  })

  it('revokes one session and removes its row', async () => {
    services.listSessions.mockResolvedValue([
      session('a', true),
      session('b', false),
    ])
    services.revokeSession.mockResolvedValue({})
    render(<ActiveSessionsPanel />)

    await userEvent.click(await screen.findByRole('button', { name: 'Revoke' }))

    expect(services.revokeSession).toHaveBeenCalledWith('b')
    await waitFor(() => expect(screen.queryByText('Safari (iOS)')).toBeNull())
  })

  it('signs out of all other sessions', async () => {
    services.listSessions.mockResolvedValue([
      session('a', true),
      session('b', false),
    ])
    services.revokeOtherSessions.mockResolvedValue({})
    render(<ActiveSessionsPanel />)

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Sign out of all other sessions',
      }),
    )

    await waitFor(() => expect(screen.queryByText('Safari (iOS)')).toBeNull())
    expect(screen.getByText('Chrome (Windows)')).toBeInTheDocument()
  })

  it('shows an error with retry when loading fails', async () => {
    services.listSessions.mockRejectedValueOnce(new Error('boom'))
    services.listSessions.mockResolvedValueOnce([session('a', true)])
    render(<ActiveSessionsPanel />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Chrome (Windows)')).toBeInTheDocument()
  })
})
