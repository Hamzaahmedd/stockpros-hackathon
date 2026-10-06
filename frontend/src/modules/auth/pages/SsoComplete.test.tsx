import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const services = vi.hoisted(() => ({ exchangeSsoCode: vi.fn() }))
const finish = vi.hoisted(() => ({ finishLogin: vi.fn() }))
vi.mock('../services', () => services)
vi.mock('../hooks/useFinishLogin', async () => {
  const actual = await vi.importActual<
    typeof import('../hooks/useFinishLogin')
  >('../hooks/useFinishLogin')
  return { ...actual, useFinishLogin: () => finish.finishLogin }
})
vi.mock('../hooks/useRedirectWhenSignedIn', () => ({
  useRedirectWhenSignedIn: vi.fn(),
}))

import { LoginOutcome } from '../hooks/useFinishLogin'
import { useRedirectWhenSignedIn } from '../hooks/useRedirectWhenSignedIn'
import { SSO_FAILED_MESSAGE } from '../utils/loginPolicy'
import { readSsoBinding, saveSsoBinding } from '../utils/sso'
import { SsoComplete } from './SsoComplete'

// Each case needs its own code: a code is only ever exchanged once per page load.
let counter = 0
const renderPage = (code: string | null = `code-${++counter}`) =>
  render(
    <MemoryRouter
      initialEntries={[
        code ? `/auth/sso/complete?code=${code}` : '/auth/sso/complete',
      ]}
    >
      <Routes>
        <Route path='/auth/sso/complete' element={<SsoComplete />} />
        <Route path='/login' element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  services.exchangeSsoCode.mockReset()
  finish.finishLogin.mockReset()
  vi.mocked(useRedirectWhenSignedIn).mockClear()
  sessionStorage.clear()
})

describe('SsoComplete', () => {
  it('swaps the code and this browser’s binding token for a session', async () => {
    saveSsoBinding('binding-1')
    services.exchangeSsoCode.mockResolvedValue({ data: { accessToken: 'a' } })
    finish.finishLogin.mockResolvedValue(LoginOutcome.SIGNED_IN)

    renderPage('code-ok')

    await waitFor(() =>
      expect(services.exchangeSsoCode).toHaveBeenCalledWith(
        'code-ok',
        'binding-1',
      ),
    )
    expect(finish.finishLogin).toHaveBeenCalledWith(
      { accessToken: 'a' },
      expect.objectContaining({ providerName: 'SSO' }),
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    // The binding token is single-use: it is gone once the exchange starts.
    expect(readSsoBinding()).toBeNull()
  })

  it('pauses the signed-in redirect while phone verification takes over', async () => {
    saveSsoBinding('binding-1')
    services.exchangeSsoCode.mockResolvedValue({ data: {} })
    finish.finishLogin.mockImplementation(
      async (_data, options: { onPhoneVerification?: () => void }) => {
        options.onPhoneVerification?.()
        return LoginOutcome.PHONE_VERIFICATION
      },
    )

    renderPage()

    await waitFor(() =>
      expect(useRedirectWhenSignedIn).toHaveBeenLastCalledWith(true),
    )
  })

  it('shows a failure when the link carries no code', () => {
    renderPage(null)

    expect(screen.getByRole('alert')).toHaveTextContent(SSO_FAILED_MESSAGE)
    expect(services.exchangeSsoCode).not.toHaveBeenCalled()
  })

  it('refuses a sign-in that was not started in this browser tab', async () => {
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'not started in this browser tab',
    )
    expect(services.exchangeSsoCode).not.toHaveBeenCalled()
  })

  it('shows the server’s message when the exchange is refused', async () => {
    saveSsoBinding('binding-1')
    services.exchangeSsoCode.mockRejectedValue({
      response: { data: { message: 'Invalid or expired SSO sign-in' } },
    })

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid or expired SSO sign-in',
    )
  })

  it('falls back to a generic message for an unreadable failure', async () => {
    saveSsoBinding('binding-1')
    services.exchangeSsoCode.mockRejectedValue(new Error('network'))

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      SSO_FAILED_MESSAGE,
    )
  })

  it('reports a response that carried no session', async () => {
    saveSsoBinding('binding-1')
    services.exchangeSsoCode.mockResolvedValue({ data: {} })
    finish.finishLogin.mockResolvedValue(LoginOutcome.FAILED)

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      SSO_FAILED_MESSAGE,
    )
  })

  it('offers a way back to sign in after a failure', async () => {
    renderPage(null)

    screen.getByRole('button', { name: /back to sign in/i }).click()

    expect(await screen.findByText('login page')).toBeInTheDocument()
  })
})
