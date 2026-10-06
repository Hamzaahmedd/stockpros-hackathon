import { useAuth } from '@/modules/auth/hooks/useAuth'
import api from '@/shared/api/axios'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { GOOGLE_CLIENT_ID } from '@/shared/config'
import { apiErrorMessage } from '@/shared/utils/api-error'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  CheckCircle2,
  KeyRound,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { useFinishLogin } from '../hooks/useFinishLogin'
import { useLoginOptions } from '../hooks/useLoginOptions'
import { useRedirectWhenSignedIn } from '../hooks/useRedirectWhenSignedIn'
import { googleLogin, startSsoLogin } from '../services'
import {
  isGoogleRequired,
  isMagicLinkBlocked,
  isSsoRequired,
  loginMethodRequiredMessage,
  loginPolicyNotice,
  SSO_FAILED_MESSAGE,
} from '../utils/loginPolicy'
import {
  isSafeRedirectUrl,
  saveSsoBinding,
  SSO_LOGIN_PARAM,
  SsoReturnResult,
} from '../utils/sso'
import { loginSchema, type LoginFormValues } from '../validation'

// Minimal typings for the Google Identity Services SDK loaded in index.html
declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential?: string }) => void
          }) => void
          renderButton: (
            parent: HTMLElement,
            options: Record<string, unknown>,
          ) => void
        }
      }
    }
  }
}

export const Login: React.FC = () => {
  const { loading } = useAuth()
  const finishLogin = useFinishLogin()
  const [searchParams] = useSearchParams()
  // The identity provider round trip ended in failure (the app is told only that, never why).
  const ssoFailed = searchParams.get(SSO_LOGIN_PARAM) === SsoReturnResult.FAILED
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isSsoLoading, setIsSsoLoading] = useState(false)
  // Set once a Google sign-in response says phone verification is required,
  // so the "already logged in" effect below doesn't race an imperative
  // navigate to /auth/verify-phone and bounce the user back to the dashboard.
  const [phoneVerificationPending, setPhoneVerificationPending] =
    useState(false)
  const googleButtonRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Set when the server refused a login method for the typed email's domain.
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)

  const { register, handleSubmit, formState, watch } = useForm<LoginFormValues>(
    {
      resolver: zodResolver(loginSchema),
      defaultValues: {
        email: '',
      },
    },
  )

  const email = watch('email')
  const { authPolicy, ssoAvailable } = useLoginOptions(email)
  const ssoRequired = isSsoRequired(authPolicy)
  const policyNotice = blockedMessage ?? loginPolicyNotice(authPolicy)
  const googleRequired =
    !ssoRequired && (blockedMessage !== null || isGoogleRequired(authPolicy))
  const magicLinkBlocked =
    blockedMessage !== null || isMagicLinkBlocked(authPolicy)

  // A refusal belongs to the email it was issued for.
  useEffect(() => {
    setBlockedMessage(null)
  }, [email])

  // Redirect if already logged in
  useRedirectWhenSignedIn(phoneVerificationPending)

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [resendCooldown])

  const sendLoginLink = async (email: string) => {
    setIsSubmitting(true)
    try {
      await api.post('/api/v1/auth/magic-link', { email })
      setSubmittedEmail(email)
      setResendCooldown(30) // 30s cooldown before resending
      toast.success('Magic link sent! Please check your inbox.')
    } catch (err: any) {
      const methodRequired = loginMethodRequiredMessage(err)
      if (methodRequired) {
        setBlockedMessage(methodRequired)
      } else {
        toast.error(
          err?.response?.data?.message ||
            'Failed to send magic link. Please try again.',
        )
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const onSubmit = async (data: LoginFormValues) => {
    await sendLoginLink(data.email)
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || !submittedEmail) return
    await sendLoginLink(submittedEmail)
  }

  // ─── Continue with Google ────────────────────────────────────────────────
  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setIsGoogleLoading(true)
      try {
        const response = await googleLogin(credential)
        await finishLogin(response.data || {}, {
          providerName: 'Google',
          onPhoneVerification: () => setPhoneVerificationPending(true),
        })
      } catch (err: any) {
        const methodRequired = loginMethodRequiredMessage(err)
        if (methodRequired) {
          setBlockedMessage(methodRequired)
        } else {
          toast.error(
            err?.response?.data?.message ||
              'Google sign-in failed. Please try again.',
          )
        }
      } finally {
        setIsGoogleLoading(false)
      }
    },
    [finishLogin],
  )

  // ─── Continue with SSO ───────────────────────────────────────────────────
  const handleSso = async () => {
    setIsSsoLoading(true)
    try {
      const { redirectUrl, bindingToken } = await startSsoLogin(email)
      if (!isSafeRedirectUrl(redirectUrl)) {
        toast.error(SSO_FAILED_MESSAGE)
        setIsSsoLoading(false)
        return
      }
      saveSsoBinding(bindingToken)
      window.location.assign(redirectUrl)
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, SSO_FAILED_MESSAGE))
      setIsSsoLoading(false)
    }
  }

  // Initialize Google Identity Services and render the official sign-in button
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || submittedEmail) return

    let attempts = 0
    const interval = setInterval(() => {
      const gis = window.google?.accounts?.id

      if (gis && googleButtonRef.current) {
        clearInterval(interval)
        gis.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (response?.credential)
              handleGoogleCredential(response.credential)
          },
        })
        const formW =
          formRef.current?.offsetWidth ||
          googleButtonRef.current.offsetWidth ||
          400
        const scale = 48 / 40 // h-12 (48px) / GIS "large" (40px)
        gis.renderButton(googleButtonRef.current, {
          theme: 'outline_white',
          size: 'large',
          text: 'continue_with',
          logo_alignment: 'center',
          width: Math.floor(formW / scale),
        })
        if (googleButtonRef.current) {
          googleButtonRef.current.style.transform = `scale(${scale})`
          googleButtonRef.current.style.transformOrigin = 'top left'
        }
      } else if (++attempts > 50) {
        // GIS script failed to load within ~10s — stop retrying
        clearInterval(interval)
      }
    }, 200)

    return () => clearInterval(interval)
  }, [handleGoogleCredential, submittedEmail])

  if (submittedEmail) {
    return (
      <AuthLayout
        loading={loading}
        title='Check your inbox'
        subtitle='We sent a one-time magic login link to your email.'
      >
        <div className='animate-fadeIn space-y-6'>
          <div className='relative overflow-hidden rounded-2xl border border-gray-800/80 bg-gradient-to-b from-gray-900/90 to-gray-950/90 p-6 shadow-2xl'>
            <div className='absolute right-0 top-0 h-32 w-32 rounded-full bg-cyan-500/10 blur-2xl'></div>

            <div className='mb-4 flex items-center gap-4'>
              <div className='flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400'>
                <Mail className='h-6 w-6 animate-pulse' />
              </div>
              <div>
                <p className='text-xs font-semibold uppercase tracking-wider text-cyan-400'>
                  Authentication Email Sent
                </p>
                <p className='break-all text-sm font-bold text-white'>
                  {submittedEmail}
                </p>
              </div>
            </div>

            <div className='space-y-2.5 border-t border-gray-800/60 pt-3 text-xs text-gray-300'>
              <div className='flex items-center gap-2 text-emerald-400'>
                <CheckCircle2 className='h-4 w-4 shrink-0' />
                <span>Click the link in your email to sign in instantly</span>
              </div>
              <div className='flex items-center gap-2 text-gray-400'>
                <ShieldCheck className='h-4 w-4 shrink-0 text-cyan-400' />
                <span>
                  Link expires strictly in <strong>10 minutes</strong> and is
                  single-use
                </span>
              </div>
            </div>
          </div>

          <div className='space-y-3'>
            <Button
              type='button'
              onClick={handleResend}
              disabled={resendCooldown > 0 || isSubmitting}
              className='flex h-12 w-full items-center justify-center gap-2 border border-gray-700 bg-gray-800 text-sm font-semibold text-white transition-all hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {isSubmitting ? (
                <Skeleton className='h-4 w-4 rounded-full bg-white/20' />
              ) : (
                <RefreshCw className='h-4 w-4' />
              )}
              {resendCooldown > 0 && `Resend link in ${resendCooldown}s`}
              {resendCooldown <= 0 && isSubmitting && 'Resending...'}
              {resendCooldown <= 0 && !isSubmitting && 'Resend email link'}
            </Button>

            <button
              type='button'
              onClick={() => {
                setSubmittedEmail(null)
                setResendCooldown(0)
              }}
              className='w-full py-2 text-center text-xs text-gray-400 transition-colors hover:text-cyan-400'
            >
              Use a different email address
            </button>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      loading={loading}
      title='Sign in to StockPros'
      subtitle='Your intelligent companion for stock market analysis and forecasting'
    >
      <form
        ref={formRef}
        onSubmit={handleSubmit(onSubmit)}
        className='space-y-6'
      >
        {GOOGLE_CLIENT_ID && (
          <div className='space-y-5'>
            <div
              className={`relative h-12 overflow-hidden rounded-lg ${googleRequired ? 'shadow-[0_0_20px_rgba(6,182,212,0.4)] ring-2 ring-cyan-400' : ''} ${ssoRequired ? 'pointer-events-none opacity-40' : ''}`}
              aria-hidden={ssoRequired}
            >
              <div ref={googleButtonRef} className='absolute left-0 top-0' />
              {isGoogleLoading && (
                <div className='absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/60'>
                  <Skeleton className='h-5 w-5 rounded-full bg-cyan-400/40' />
                </div>
              )}
            </div>

            <div className='flex items-center gap-3'>
              <div className='h-px flex-1 bg-gray-800'></div>
              <span className='text-xs uppercase tracking-wider text-gray-500'>
                or
              </span>
              <div className='h-px flex-1 bg-gray-800'></div>
            </div>
          </div>
        )}

        <div>
          <label
            htmlFor='email'
            className='mb-2.5 block text-base font-semibold tracking-wide text-[#E2E8F0]'
          >
            Email Address
          </label>
          <Input
            id='email'
            type='email'
            placeholder='you@example.com'
            error={formState.errors.email?.message}
            registration={register('email')}
            autoComplete='email'
            autoFocus
            label=''
            className='h-12 w-full rounded-lg border-gray-800 bg-gray-950/60 text-white transition-all placeholder:text-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/25'
          />
          {ssoFailed && !policyNotice && (
            <div
              role='alert'
              className='mt-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100'
            >
              <ShieldAlert className='mt-0.5 h-4 w-4 shrink-0 text-red-400' />
              <span>{SSO_FAILED_MESSAGE}</span>
            </div>
          )}
          {policyNotice && (
            <div
              role='alert'
              className='mt-3 flex items-start gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-3 text-sm text-cyan-100'
            >
              <ShieldAlert className='mt-0.5 h-4 w-4 shrink-0 text-cyan-400' />
              <span>{policyNotice}</span>
            </div>
          )}
        </div>

        {ssoAvailable && (
          <Button
            type='button'
            onClick={handleSso}
            disabled={isSsoLoading}
            className={`flex h-12 w-full items-center justify-center gap-2 text-base font-bold transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50 ${ssoRequired ? 'border border-cyan-400/40 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] ring-2 ring-cyan-400' : 'border border-gray-700 bg-gray-800 text-white hover:bg-gray-700'}`}
          >
            {isSsoLoading ? (
              <Skeleton className='h-4 w-4 rounded-full bg-white/30' />
            ) : (
              <KeyRound className='h-4 w-4' />
            )}
            <span>{isSsoLoading ? 'Redirecting...' : 'Continue with SSO'}</span>
          </Button>
        )}

        <Button
          type='submit'
          disabled={formState.isSubmitting || isSubmitting || magicLinkBlocked}
          className='mt-4 flex h-12 w-full items-center justify-center gap-2 border border-cyan-400/40 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 text-base font-bold text-white shadow-lg shadow-cyan-950/40 transition-all duration-300 hover:border-cyan-400 hover:from-blue-600 hover:via-cyan-600 hover:to-cyan-500 hover:shadow-[0_0_25px_rgba(6,182,212,0.35)] focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
        >
          {formState.isSubmitting || isSubmitting ? (
            <div className='flex items-center justify-center gap-2'>
              <Skeleton className='h-4 w-4 rounded-full bg-white/30' />
              <span>Sending link...</span>
            </div>
          ) : (
            <span>Continue with email</span>
          )}
        </Button>
      </form>
    </AuthLayout>
  )
}
