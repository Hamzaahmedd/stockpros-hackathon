import { apiErrorMessage } from '@/shared/utils/api-error'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '../components/Button'
import { LoginOutcome, useFinishLogin } from '../hooks/useFinishLogin'
import { useRedirectWhenSignedIn } from '../hooks/useRedirectWhenSignedIn'
import { exchangeSsoCode } from '../services'
import { clearSsoBinding, readSsoBinding } from '../utils/sso'
import { SSO_FAILED_MESSAGE } from '../utils/loginPolicy'

// A code works once, so a re-run (React strict mode) must not send it twice.
const attemptedCodes = new Set<string>()

/** Landing page after the identity provider: swaps the one-time code for a session. */
export const SsoComplete = () => {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')
  const finishLogin = useFinishLogin()
  const [error, setError] = useState<string | null>(null)
  const [phonePending, setPhonePending] = useState(false)

  useRedirectWhenSignedIn(phonePending)

  useEffect(() => {
    if (!code) {
      setError(SSO_FAILED_MESSAGE)
      return
    }
    if (attemptedCodes.has(code)) return
    attemptedCodes.add(code)

    const bindingToken = readSsoBinding()
    clearSsoBinding()
    if (!bindingToken) {
      setError(
        'This sign-in was not started in this browser tab. Please start again from the login page.',
      )
      return
    }

    const complete = async () => {
      try {
        const response = await exchangeSsoCode(code, bindingToken)
        const outcome = await finishLogin(response.data ?? {}, {
          providerName: 'SSO',
          onPhoneVerification: () => setPhonePending(true),
        })
        if (outcome === LoginOutcome.FAILED) setError(SSO_FAILED_MESSAGE)
      } catch (err: unknown) {
        setError(apiErrorMessage(err, SSO_FAILED_MESSAGE))
      }
    }
    void complete()
  }, [code, finishLogin])

  if (error) {
    return (
      <AuthLayout
        title='Single sign-on failed'
        subtitle='We could not complete your sign-in.'
      >
        <div className='animate-fadeIn space-y-6'>
          <div
            role='alert'
            className='flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200'
          >
            <AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-red-400' />
            <span>{error}</span>
          </div>
          <Link to='/login'>
            <Button
              type='button'
              className='flex h-12 w-full items-center justify-center gap-2 border border-gray-700 bg-gray-800 text-sm font-semibold text-white transition-all hover:bg-gray-700'
            >
              Back to sign in
              <ArrowRight className='h-4 w-4' />
            </Button>
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title='Signing you in'
      subtitle='Completing single sign-on with your organization.'
    >
      <div
        role='status'
        className='h-4 w-40 animate-pulse rounded-md bg-primary/10'
      />
    </AuthLayout>
  )
}
