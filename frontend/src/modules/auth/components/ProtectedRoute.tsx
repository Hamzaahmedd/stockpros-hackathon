// src/routes/ProtectedRoute.tsx
import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import type { PlatformRole, ScreenPermissions } from '../types'

interface Props {
  children: React.ReactNode
  resource?: string
  action?: keyof ScreenPermissions
  requirements?: readonly {
    resource: string
    action?: keyof ScreenPermissions
  }[]
  /** Requires config.features.pricingTiersEnabled to be on; otherwise redirects away (e.g. /plans while the pricing page is disabled). */
  requirePricingTiersEnabled?: boolean
  /** Requires config.features.enablePaymentProcessor to be on; otherwise redirects away (e.g. /plans/manage, since Subscription rows only exist in Payment Mode). */
  requireEnablePaymentProcessor?: boolean
  /** Internal staff gate: the signed-in user's platformRole must be one of these (e.g. the /admin ops panel); otherwise redirects away. */
  requirePlatformRole?: readonly PlatformRole[]
}

export const ProtectedRoute: React.FC<Props> = ({
  children,
  resource,
  action = 'canRead',
  requirements,
  requirePricingTiersEnabled,
  requireEnablePaymentProcessor,
  requirePlatformRole,
}) => {
  const { user, loading, can, pricingTiersEnabled, enablePaymentProcessor } =
    useAuth()
  const requiredPermissions =
    requirements ?? (resource ? [{ resource, action }] : [])

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <div className='flex flex-col items-center gap-4'>
          <div className='h-12 w-12 animate-pulse rounded-full bg-primary/10' />
          <div className='h-4 w-32 animate-pulse rounded-md bg-primary/10' />
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to='/login' replace />

  if (requirePricingTiersEnabled && !pricingTiersEnabled) {
    return <Navigate to='/dashboard' replace />
  }

  if (
    requirePlatformRole &&
    !requirePlatformRole.includes(user.platformRole ?? 'USER')
  ) {
    return <Navigate to='/dashboard' replace />
  }

  if (requireEnablePaymentProcessor && !enablePaymentProcessor) {
    return <Navigate to='/dashboard' replace />
  }

  if (
    !requiredPermissions.every(({ resource, action }) =>
      can(resource, action ?? 'canRead'),
    )
  ) {
    return (
      <main className='flex min-h-screen items-center justify-center p-6'>
        <section className='max-w-md space-y-3 text-center'>
          <h1 className='text-2xl font-semibold'>Access denied</h1>
          <p className='text-muted-foreground'>
            Your assigned permissions do not allow access to this area.
          </p>
        </section>
      </main>
    )
  }

  return <>{children}</>
}
