import { Skeleton } from '@/shared/components/ui/skeleton'
import { setAccessToken } from '@/shared/utils/token'
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import posthog from 'posthog-js'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../../shared/api/axios'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '../components/Button'
import { useAuth } from '../hooks/useAuth'
import { loginMethodRequiredMessage } from '../utils/loginPolicy'

const verifiedTokens = new Set<string>()

export const VerifyMagicLink = () => {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const { can, refreshMe } = useAuth()
  const [error, setError] = useState<string | null>(null)
  // The link was refused because the domain requires Google sign-in (not an invalid link).
  const [methodRequired, setMethodRequired] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setError(
        'No authentication token was found in the link. Please request a new login link.',
      )
      return
    }

    // Prevent duplicate API calls for the same token
    if (verifiedTokens.has(token)) {
      return
    }
    verifiedTokens.add(token)

    const verify = async () => {
      try {
        const response = await api.post('/api/v1/auth/verify-magic-link', {
          token,
        })
        const {
          requiresOnboarding,
          requiresPhoneVerification,
          onboardingToken,
          accessToken,
          user,
        } = response.data

        // New user — backend verified the email but needs profile setup first
        if (requiresOnboarding && onboardingToken) {
          sessionStorage.setItem('onboarding_token', onboardingToken)
          setIsSuccess(true)
          setTimeout(() => {
            navigate('/auth/onboarding', { replace: true })
          }, 800)
          return
        }

        // Existing user — store access token and refresh auth context
        if (accessToken) {
          setAccessToken(accessToken)
        }

        const verifiedUser = await refreshMe()
        if (verifiedUser) posthog.identify(verifiedUser.userId)
        setIsSuccess(true)

        // Determine destination based on user profile and role. Phone
        // verification (when required) takes priority over any other
        // destination — checked before onboarding/dashboard routing.
        setTimeout(() => {
          if (requiresPhoneVerification) {
            navigate('/auth/verify-phone', { replace: true })
            return
          }

          if (!user?.displayName || user.displayName.trim() === '') {
            navigate('/auth/onboarding', { replace: true })
            return
          }

          const isAdminOnly =
            !can('CORE_APP', 'canRead') && can('ACCESS_CONTROL', 'canRead')

          if (isAdminOnly) {
            navigate('/access-control/users', { replace: true })
          } else {
            navigate('/dashboard', { replace: true })
          }
        }, 800)
      } catch (err: any) {
        const required = loginMethodRequiredMessage(err)
        if (required) {
          setMethodRequired(true)
          setError(required)
          return
        }
        setError(
          err.response?.data?.message ||
            'Authentication failed. The login link may be invalid, already used, or expired.',
        )
      }
    }

    verify()
  }, [token, can, navigate, refreshMe])

  if (error) {
    return (
      <AuthLayout
        title={methodRequired ? 'Sign in with Google' : 'Authentication Failed'}
        subtitle={
          methodRequired
            ? 'Your organization does not allow email-link sign-in.'
            : 'We could not verify your login link.'
        }
      >
        <div className='space-y-6'>
          <div className='flex items-start gap-4 rounded-2xl border border-red-900/50 bg-red-950/30 p-6 shadow-xl'>
            <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400'>
              <AlertTriangle className='h-5 w-5' />
            </div>
            <div>
              <p className='mb-1 text-sm font-semibold text-white'>
                {methodRequired
                  ? 'Sign-in method required'
                  : 'Link Invalid or Expired'}
              </p>
              <p className='text-xs leading-relaxed text-red-300'>{error}</p>
            </div>
          </div>

          <Link to='/login' className='block w-full'>
            <Button className='flex h-12 w-full items-center justify-center gap-2 border-none bg-[#0047AB] text-sm font-bold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-[#003385]'>
              <span>
                {methodRequired
                  ? 'Sign in with Google'
                  : 'Request a new login link'}
              </span>
              <ArrowRight className='ml-1 h-4 w-4' />
            </Button>
          </Link>
        </div>
      </AuthLayout>
    )
  }

  if (isSuccess) {
    return (
      <AuthLayout
        title='Authenticated!'
        subtitle='Redirecting you into StockPros terminal...'
      >
        <div className='flex flex-col items-center justify-center space-y-4 py-10'>
          <div className='flex h-16 w-16 animate-bounce items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'>
            <CheckCircle2 className='h-8 w-8' />
          </div>
          <p className='text-sm text-gray-300'>
            Session verified successfully.
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title='Verifying Security Token...'
      subtitle='Please wait while we establish your authenticated session.'
    >
      <div className='flex flex-col items-center justify-center space-y-5 py-12'>
        <div className='relative'>
          <Skeleton className='h-14 w-14 rounded-full' />
        </div>
      </div>
    </AuthLayout>
  )
}
