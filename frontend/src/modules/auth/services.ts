import api from '@/shared/api/axios'
import { unwrapEnvelope } from '@/shared/api/envelope'
import { DomainAuthPolicy, type OnboardingDto } from './types'
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

/** The sign-in policy of the email's company domain. Never throws: any failure means "no restriction". */
export const getLoginAuthPolicy = async (
  email: string,
): Promise<DomainAuthPolicy> => {
  try {
    const data = unwrapEnvelope<{ authPolicy?: string }>(
      await api.post('/api/v1/auth/login-options', { email }),
    )
    return parseDomainAuthPolicy(data.authPolicy ?? '') ?? DomainAuthPolicy.ANY
  } catch {
    return DomainAuthPolicy.ANY
  }
}
