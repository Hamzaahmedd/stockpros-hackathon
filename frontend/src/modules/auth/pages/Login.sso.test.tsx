import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const options = vi.hoisted(() => ({
  value: { authPolicy: 'ANY', ssoAvailable: false } as {
    authPolicy: string
    ssoAvailable: boolean
  },
}))
const services = vi.hoisted(() => ({
  googleLogin: vi.fn(),
  startSsoLogin: vi.fn(),
}))
const toasts = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock('../hooks/useLoginOptions', () => ({
  useLoginOptions: () => options.value,
}))
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ loading: false }) }))
vi.mock('@/modules/auth/hooks/useAuth', () => ({
  useAuth: () => ({ loading: false }),
}))
vi.mock('../hooks/useFinishLogin', () => ({ useFinishLogin: () => vi.fn() }))
vi.mock('../hooks/useRedirectWhenSignedIn', () => ({
  useRedirectWhenSignedIn: vi.fn(),
}))
vi.mock('../services', () => services)
vi.mock('react-toastify', () => ({ toast: toasts }))

import { DomainAuthPolicy } from '../types'
import { SSO_FAILED_MESSAGE } from '../utils/loginPolicy'
import { readSsoBinding } from '../utils/sso'
import { Login } from './Login'

const assign = vi.fn()

const renderLogin = (path = '/login') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Login />
    </MemoryRouter>,
  )

const typeEmail = async (email = 'sam@fund.com') => {
  await userEvent.type(screen.getByLabelText('Email Address'), email)
}

beforeEach(() => {
  options.value = { authPolicy: DomainAuthPolicy.ANY, ssoAvailable: false }
  services.startSsoLogin.mockReset()
  toasts.error.mockReset()
  assign.mockReset()
  sessionStorage.clear()
  vi.stubGlobal('location', { ...window.location, assign })
})

describe('login screen with SSO', () => {
  it('offers no SSO button for an ordinary domain', () => {
    renderLogin()

    expect(
      screen.queryByRole('button', { name: /continue with sso/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /continue with email/i }),
    ).toBeEnabled()
  })

  it('offers SSO next to the magic link when the domain has it but does not require it', () => {
    options.value = { authPolicy: DomainAuthPolicy.ANY, ssoAvailable: true }

    renderLogin()

    expect(
      screen.getByRole('button', { name: /continue with sso/i }),
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: /continue with email/i }),
    ).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('requires SSO: says so and disables the magic link', () => {
    options.value = {
      authPolicy: DomainAuthPolicy.SAML_SSO,
      ssoAvailable: true,
    }

    renderLogin()

    expect(screen.getByRole('alert')).toHaveTextContent('single sign-on')
    expect(
      screen.getByRole('button', { name: /continue with email/i }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /continue with sso/i }),
    ).toBeEnabled()
  })

  it('still blocks the magic link for a Google-only domain without SSO', () => {
    options.value = {
      authPolicy: DomainAuthPolicy.GOOGLE_ONLY,
      ssoAvailable: false,
    }

    renderLogin()

    expect(
      screen.getByRole('button', { name: /continue with email/i }),
    ).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: /continue with sso/i }),
    ).not.toBeInTheDocument()
  })

  it('starts SSO: keeps the binding token and sends the browser to the IdP', async () => {
    options.value = { authPolicy: DomainAuthPolicy.ANY, ssoAvailable: true }
    services.startSsoLogin.mockResolvedValue({
      redirectUrl: 'https://idp.example.com/sso?SAMLRequest=x',
      bindingToken: 'binding-1',
    })
    renderLogin()
    await typeEmail()

    await userEvent.click(
      screen.getByRole('button', { name: /continue with sso/i }),
    )

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        'https://idp.example.com/sso?SAMLRequest=x',
      ),
    )
    expect(services.startSsoLogin).toHaveBeenCalledWith('sam@fund.com')
    expect(readSsoBinding()).toBe('binding-1')
  })

  it('refuses to follow a redirect that is not https', async () => {
    options.value = { authPolicy: DomainAuthPolicy.ANY, ssoAvailable: true }
    services.startSsoLogin.mockResolvedValue({
      redirectUrl: 'javascript:alert(1)',
      bindingToken: 'binding-1',
    })
    renderLogin()
    await typeEmail()

    await userEvent.click(
      screen.getByRole('button', { name: /continue with sso/i }),
    )

    await waitFor(() => expect(toasts.error).toHaveBeenCalled())
    expect(assign).not.toHaveBeenCalled()
    expect(readSsoBinding()).toBeNull()
    expect(
      screen.getByRole('button', { name: /continue with sso/i }),
    ).toBeEnabled()
  })

  it('shows the server’s reason when SSO cannot start', async () => {
    options.value = { authPolicy: DomainAuthPolicy.ANY, ssoAvailable: true }
    services.startSsoLogin.mockRejectedValue({
      response: { data: { message: 'SSO is not available for this email' } },
    })
    renderLogin()
    await typeEmail()

    await userEvent.click(
      screen.getByRole('button', { name: /continue with sso/i }),
    )

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith(
        'SSO is not available for this email',
      ),
    )
    expect(assign).not.toHaveBeenCalled()
  })

  it('explains a failed round trip when the IdP sends the user back', () => {
    renderLogin('/login?sso=failed')

    expect(screen.getByRole('alert')).toHaveTextContent(SSO_FAILED_MESSAGE)
  })

  it('does not stack the failure notice on the policy notice', () => {
    options.value = {
      authPolicy: DomainAuthPolicy.SAML_SSO,
      ssoAvailable: true,
    }

    renderLogin('/login?sso=failed')

    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})
