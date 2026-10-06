import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  refreshMe: vi.fn(),
  user: null as unknown,
  can: vi.fn(),
}))
const navigate = vi.hoisted(() => vi.fn())
const toasts = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const posthog = vi.hoisted(() => ({ identify: vi.fn() }))
const token = vi.hoisted(() => ({ setAccessToken: vi.fn() }))

vi.mock('./useAuth', () => ({ useAuth: () => auth }))
vi.mock('react-toastify', () => ({ toast: toasts }))
vi.mock('posthog-js', () => ({ default: posthog }))
vi.mock('@/shared/utils/token', () => token)
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  )),
  useNavigate: () => navigate,
}))

import { LoginOutcome, useFinishLogin } from './useFinishLogin'
import { useRedirectWhenSignedIn } from './useRedirectWhenSignedIn'

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
)

const finish = () =>
  renderHook(() => useFinishLogin(), { wrapper }).result.current

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  auth.user = null
  auth.refreshMe.mockResolvedValue({ userId: 'u1' })
})

describe('useFinishLogin', () => {
  it('sends a new user to onboarding with their token and suggested name', async () => {
    const outcome = await finish()(
      {
        requiresOnboarding: true,
        onboardingToken: 'onboard-1',
        defaultDisplayName: 'sam',
      },
      { providerName: 'SSO' },
    )

    expect(outcome).toBe(LoginOutcome.ONBOARDING)
    expect(sessionStorage.getItem('onboarding_token')).toBe('onboard-1')
    expect(sessionStorage.getItem('onboarding_display_name')).toBe('sam')
    expect(navigate).toHaveBeenCalledWith('/auth/onboarding', { replace: true })
    expect(token.setAccessToken).not.toHaveBeenCalled()
  })

  it('does not store a suggested name that was not sent', async () => {
    await finish()(
      { requiresOnboarding: true, onboardingToken: 'onboard-1' },
      { providerName: 'SSO' },
    )

    expect(sessionStorage.getItem('onboarding_display_name')).toBeNull()
  })

  it('fails, naming the provider, when there is neither onboarding nor a session', async () => {
    const outcome = await finish()({}, { providerName: 'Google' })

    expect(outcome).toBe(LoginOutcome.FAILED)
    expect(toasts.error).toHaveBeenCalledWith(
      'Google sign-in failed. Please try again.',
    )
    expect(navigate).not.toHaveBeenCalled()
  })

  it('stores the session, identifies the user and leaves the redirect to the signed-in hook', async () => {
    const outcome = await finish()(
      { accessToken: 'access-1' },
      { providerName: 'SSO' },
    )

    expect(outcome).toBe(LoginOutcome.SIGNED_IN)
    expect(token.setAccessToken).toHaveBeenCalledWith('access-1')
    expect(auth.refreshMe).toHaveBeenCalled()
    expect(posthog.identify).toHaveBeenCalledWith('u1')
    expect(toasts.success).toHaveBeenCalledWith(
      'Signed in with SSO successfully',
    )
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not identify anyone when the profile could not be loaded', async () => {
    auth.refreshMe.mockResolvedValue(null)

    await finish()({ accessToken: 'access-1' }, { providerName: 'SSO' })

    expect(posthog.identify).not.toHaveBeenCalled()
  })

  it('takes phone verification first and tells the caller before navigating', async () => {
    const order: string[] = []
    navigate.mockImplementation(() => order.push('navigate'))

    const outcome = await finish()(
      { accessToken: 'access-1', requiresPhoneVerification: true },
      { providerName: 'SSO', onPhoneVerification: () => order.push('notify') },
    )

    expect(outcome).toBe(LoginOutcome.PHONE_VERIFICATION)
    expect(order).toEqual(['notify', 'navigate'])
    expect(navigate).toHaveBeenCalledWith('/auth/verify-phone', {
      replace: true,
    })
  })

  it('copes with no phone-verification callback', async () => {
    const outcome = await finish()(
      { accessToken: 'access-1', requiresPhoneVerification: true },
      { providerName: 'SSO' },
    )

    expect(outcome).toBe(LoginOutcome.PHONE_VERIFICATION)
  })
})

describe('useRedirectWhenSignedIn', () => {
  const run = (paused?: boolean) =>
    renderHook(() => useRedirectWhenSignedIn(paused), { wrapper })

  it('does nothing while signed out', () => {
    run()

    expect(navigate).not.toHaveBeenCalled()
  })

  it('sends a signed-in user to the dashboard', () => {
    auth.user = { userId: 'u1' }
    auth.can.mockReturnValue(true)

    run()

    expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true })
  })

  it('sends an admin with no app access to access control', () => {
    auth.user = { userId: 'u1' }
    auth.can.mockImplementation((resource: string) => resource !== 'CORE_APP')

    run()

    expect(navigate).toHaveBeenCalledWith('/access-control/users', {
      replace: true,
    })
  })

  it('waits while another destination is about to take over', () => {
    auth.user = { userId: 'u1' }
    auth.can.mockReturnValue(true)

    run(true)

    expect(navigate).not.toHaveBeenCalled()
  })
})
