import { setAccessToken } from '@/shared/utils/token'
import posthog from 'posthog-js'
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import type { SignInResponse } from '../types'
import { useAuth } from './useAuth'

export enum LoginOutcome {
  ONBOARDING = 'ONBOARDING',
  PHONE_VERIFICATION = 'PHONE_VERIFICATION',
  SIGNED_IN = 'SIGNED_IN',
  FAILED = 'FAILED',
}

interface FinishOptions {
  /** Shown in messages, e.g. "Google" or "SSO". */
  providerName: string
  /** Called just before navigating to phone verification, so a "signed in" redirect does not race it. */
  onPhoneVerification?: () => void
}

/**
 * What happens after a sign-in that is not a magic link (Google, SSO): a new
 * user goes to onboarding, an existing one gets their session, and phone
 * verification (when required) takes priority over any other destination.
 */
export const useFinishLogin = () => {
  const navigate = useNavigate()
  const { refreshMe } = useAuth()

  return useCallback(
    async (
      data: SignInResponse,
      { providerName, onPhoneVerification }: FinishOptions,
    ): Promise<LoginOutcome> => {
      if (data.requiresOnboarding && data.onboardingToken) {
        sessionStorage.setItem('onboarding_token', data.onboardingToken)
        if (data.defaultDisplayName) {
          sessionStorage.setItem(
            'onboarding_display_name',
            data.defaultDisplayName,
          )
        }
        toast.success('Welcome! Let’s finish setting up your profile.')
        navigate('/auth/onboarding', { replace: true })
        return LoginOutcome.ONBOARDING
      }

      if (!data.accessToken) {
        toast.error(`${providerName} sign-in failed. Please try again.`)
        return LoginOutcome.FAILED
      }

      setAccessToken(data.accessToken)
      const signedInUser = await refreshMe()
      if (signedInUser) posthog.identify(signedInUser.userId)
      toast.success(`Signed in with ${providerName} successfully`)

      if (data.requiresPhoneVerification) {
        onPhoneVerification?.()
        navigate('/auth/verify-phone', { replace: true })
        return LoginOutcome.PHONE_VERIFICATION
      }
      return LoginOutcome.SIGNED_IN
    },
    [navigate, refreshMe],
  )
}
