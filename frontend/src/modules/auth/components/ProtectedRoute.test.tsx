import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformRole } from '../types'

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@/modules/auth/hooks/useAuth', () => ({ useAuth: () => auth.value }))

import { ProtectedRoute } from './ProtectedRoute'

const STAFF: readonly PlatformRole[] = [
  'SUPPORT_AGENT',
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
]

const setAuth = (
  platformRole: PlatformRole | undefined,
  pricingTiersEnabled = true,
) => {
  auth.value = {
    user: { userId: 'u1', email: 'u@x.com', platformRole },
    loading: false,
    can: () => true,
    pricingTiersEnabled,
    enablePaymentProcessor: false,
  }
}

const renderAdminRoute = () =>
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route
          path='/admin'
          element={
            <ProtectedRoute
              requirePlatformRole={STAFF}
              requirePricingTiersEnabled
            >
              <p>ops panel</p>
            </ProtectedRoute>
          }
        />
        <Route path='/dashboard' element={<p>dashboard</p>} />
        <Route path='/login' element={<p>login</p>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  auth.value = {}
})

describe('ProtectedRoute — staff gate', () => {
  it.each(STAFF)('lets %s in when the tier workflow is on', (role) => {
    setAuth(role)
    renderAdminRoute()
    expect(screen.getByText('ops panel')).toBeInTheDocument()
  })

  it.each<PlatformRole | undefined>(['USER', undefined])(
    'sends a %s user to the dashboard',
    (role) => {
      setAuth(role)
      renderAdminRoute()
      expect(screen.getByText('dashboard')).toBeInTheDocument()
    },
  )

  it('keeps even a super admin out while the tier workflow is off', () => {
    setAuth('SUPER_ADMIN', false)
    renderAdminRoute()
    expect(screen.getByText('dashboard')).toBeInTheDocument()
  })

  it('sends signed-out visitors to login', () => {
    auth.value = {
      user: null,
      loading: false,
      can: () => false,
      pricingTiersEnabled: true,
    }
    renderAdminRoute()
    expect(screen.getByText('login')).toBeInTheDocument()
  })
})
