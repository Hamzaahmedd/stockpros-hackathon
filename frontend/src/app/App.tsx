// src/App.tsx
import { Roles, Users } from '@/modules/access-control'
import { AdminDashboard, STAFF_ROLES } from '@/modules/admin'
import {
  Login,
  Onboarding,
  ProtectedRoute,
  VerifyMagicLink,
  VerifyPhone,
  VerifyPhoneGuard,
} from '@/modules/auth'
import { Dashboard } from '@/modules/dashboard'
import {
  MarketAnalysis,
  OpportunityRadar,
  PortfolioHealth,
} from '@/modules/decision-support'
import { FeedbackList } from '@/modules/feedback'
import { Forecast } from '@/modules/forecast'
import { Markets } from '@/modules/markets'
import { News } from '@/modules/news'
import {
  ManageSubscription,
  PaymentResult,
  Plans,
  TopUpModalHost,
} from '@/modules/plans'
import { Settings } from '@/modules/settings'
import {
  INVITE_ROUTES,
  InviteEntry,
  PendingInviteAcceptor,
  PreferencesApplier,
  TeamWorkspace,
} from '@/modules/teams'
import { Watchlist } from '@/modules/watchlist'
import { NotFound } from '@/shared/components/NotFound'
import { POSTHOG_KEY } from '@/shared/config'
import posthog from 'posthog-js'
import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

const PostHogPageviewTracker = () => {
  const location = useLocation()

  useEffect(() => {
    if (POSTHOG_KEY) posthog.capture('$pageview')
  }, [location.pathname])

  return null
}

export default function App() {
  return (
    <>
      <PostHogPageviewTracker />
      <TopUpModalHost />
      <PendingInviteAcceptor />
      <PreferencesApplier />
      <ToastContainer
        position='top-right'
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme='dark'
      />
      <Routes>
        {/* Default route redirects to login */}
        <Route path='/' element={<Navigate to='/login' replace />} />

        <Route path='/login' element={<Login />} />
        <Route path='/auth/verify' element={<VerifyMagicLink />} />
        <Route
          path='/auth/verify-phone'
          element={
            <VerifyPhoneGuard>
              <VerifyPhone />
            </VerifyPhoneGuard>
          }
        />
        <Route path='/auth/onboarding' element={<Onboarding />} />

        {/* Protected routes */}
        <Route
          path='/dashboard'
          element={
            <ProtectedRoute resource='CORE_APP'>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path='/market'
          element={
            <ProtectedRoute resource='CORE_APP'>
              <Markets />
            </ProtectedRoute>
          }
        />
        <Route
          path='/forecast'
          element={
            <ProtectedRoute resource='CORE_APP'>
              <Forecast />
            </ProtectedRoute>
          }
        />
        <Route
          path='/news'
          element={
            <ProtectedRoute resource='CORE_APP'>
              <News />
            </ProtectedRoute>
          }
        />
        <Route
          path='/watchlist'
          element={
            <ProtectedRoute resource='CORE_APP'>
              <Watchlist />
            </ProtectedRoute>
          }
        />
        <Route
          path='/settings'
          element={
            <ProtectedRoute resource='CORE_APP'>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path='/teams'
          element={
            <ProtectedRoute resource='CORE_APP'>
              <TeamWorkspace />
            </ProtectedRoute>
          }
        />
        <Route
          path='/settings/team'
          element={
            <ProtectedRoute resource='CORE_APP'>
              <TeamWorkspace />
            </ProtectedRoute>
          }
        />
        {/* Public on purpose: a signed-out visitor's invite token is parked, then accepted after login. */}
        {INVITE_ROUTES.map((path) => (
          <Route key={path} path={path} element={<InviteEntry />} />
        ))}
        <Route
          path='/plans'
          element={
            <ProtectedRoute resource='CORE_APP' requirePricingTiersEnabled>
              <Plans />
            </ProtectedRoute>
          }
        />
        <Route
          path='/plans/result'
          element={
            <ProtectedRoute resource='CORE_APP' requirePricingTiersEnabled>
              <PaymentResult />
            </ProtectedRoute>
          }
        />
        <Route
          path='/plans/manage'
          element={
            <ProtectedRoute
              resource='CORE_APP'
              requirePricingTiersEnabled
              requireEnablePaymentProcessor
            >
              <ManageSubscription />
            </ProtectedRoute>
          }
        />

        <Route
          path='/decision-support/radar'
          element={
            <ProtectedRoute resource='CORE_APP'>
              <OpportunityRadar />
            </ProtectedRoute>
          }
        />
        <Route
          path='/decision-support/market-analysis'
          element={
            <ProtectedRoute resource='CORE_APP'>
              <MarketAnalysis />
            </ProtectedRoute>
          }
        />
        <Route
          path='/decision-support/portfolio-health'
          element={
            <ProtectedRoute resource='PORTFOLIO'>
              <PortfolioHealth />
            </ProtectedRoute>
          }
        />

        {/* Internal staff ops panel: tier-based workflow only, staff platform roles only. */}
        <Route
          path='/admin/*'
          element={
            <ProtectedRoute
              requirePlatformRole={STAFF_ROLES}
              requirePricingTiersEnabled
            >
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* Access Control Routes */}
        <Route
          path='/access-control/users'
          element={
            <ProtectedRoute
              requirements={[
                { resource: 'ACCESS_CONTROL' },
                { resource: 'ROLE' },
              ]}
            >
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path='/access-control/roles'
          element={
            <ProtectedRoute
              requirements={[
                { resource: 'ACCESS_CONTROL' },
                { resource: 'ROLE' },
              ]}
            >
              <Roles />
            </ProtectedRoute>
          }
        />
        <Route
          path='/access-control/feedback'
          element={
            <ProtectedRoute
              requirements={[
                { resource: 'ACCESS_CONTROL' },
                { resource: 'ROLE' },
              ]}
            >
              <FeedbackList />
            </ProtectedRoute>
          }
        />

        {/* Catch-all route */}
        <Route path='*' element={<NotFound />} />
      </Routes>
    </>
  )
}
