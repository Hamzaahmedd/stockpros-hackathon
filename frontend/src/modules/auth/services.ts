import api from '@/shared/api/axios'
import { unwrapEnvelope } from '@/shared/api/envelope'
import {
  DomainAuthPolicy,
  type LoginOptions,
  type OnboardingDto,
  type SsoStartResult,
} from './types'
import { parseDomainAuthPolicy } from './utils/loginPolicy'

export const requestMagicLink = (email: string) =>
  api.post('/api/v1/auth/magic-link', { email })

export const verifyMagicLink = (token: string) =>
  api.post('/api/v1/auth/verify-magic-link', { token })

export const completeOnboarding = (payload: OnboardingDto) =>
  api.post('/api/v1/auth/onboarding', payload)

export const googleLogin = (credential: string) =>
  api.post('/api/v1/auth/google', { credential })

export const logout = () => api.post('/api/v1/auth/logout')

export const refresh = () => api.post('/api/v1/auth/refresh-token')

export const deleteAccount = (confirmationPhrase: string) =>
  api.delete('/api/v1/auth/account', { data: { confirmationPhrase } })

export const requestPhoneOtp = (phoneNumber: string) =>
  api.post('/api/v1/auth/phone-verification/request', { phoneNumber })

export const verifyPhoneOtp = (code: string) =>
  api.post('/api/v1/auth/phone-verification/verify', { code })

const NO_RESTRICTION: LoginOptions = {
  authPolicy: DomainAuthPolicy.ANY,
  ssoAvailable: false,
}

/** How the email's company domain lets people sign in. Never throws: any failure means "no restriction". */
export const getLoginOptions = async (email: string): Promise<LoginOptions> => {
  try {
    const data = unwrapEnvelope<{
      authPolicy?: string
      ssoAvailable?: boolean
    }>(await api.post('/api/v1/auth/login-options', { email }))
    return {
      authPolicy:
        parseDomainAuthPolicy(data.authPolicy ?? '') ?? DomainAuthPolicy.ANY,
      ssoAvailable: data.ssoAvailable === true,
    }
  } catch {
    return NO_RESTRICTION
  }
}

/** Starts a single sign-in; the browser is then sent to `redirectUrl`. */
export const startSsoLogin = async (email: string): Promise<SsoStartResult> =>
  unwrapEnvelope<SsoStartResult>(
    await api.post('/api/v1/auth/sso/start', { email }),
  )

/** Trades the one-time code, plus this browser's binding token, for a session. */
export const exchangeSsoCode = (code: string, bindingToken: string) =>
  api.post('/api/v1/auth/sso/exchange', { code, bindingToken })
