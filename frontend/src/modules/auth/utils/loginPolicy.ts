import { apiErrorBody } from '@/shared/utils/api-error'
import { DomainAuthPolicy } from '../types'

/** Error code the backend answers with when a domain's policy forbids the attempted login method. */
export const LOGIN_METHOD_REQUIRED_CODE = 'LOGIN_METHOD_REQUIRED'

export const DEFAULT_LOGIN_METHOD_MESSAGE =
  'Your organization requires signing in with Google'

const DOMAIN_AUTH_POLICIES: readonly DomainAuthPolicy[] =
  Object.values(DomainAuthPolicy)

export const parseDomainAuthPolicy = (
  value: string,
): DomainAuthPolicy | undefined =>
  DOMAIN_AUTH_POLICIES.find((policy) => policy === value)

/** True when the policy forbids magic-link login. */
export const isGoogleRequired = (policy: DomainAuthPolicy): boolean =>
  policy !== DomainAuthPolicy.ANY

/** The inline notice shown on the login form for a restricted domain; null when unrestricted. */
export const loginPolicyNotice = (policy: DomainAuthPolicy): string | null => {
  if (policy === DomainAuthPolicy.GOOGLE_WORKSPACE) {
    return `${DEFAULT_LOGIN_METHOD_MESSAGE} — use your company Google Workspace account`
  }
  return isGoogleRequired(policy) ? DEFAULT_LOGIN_METHOD_MESSAGE : null
}

/** The server's message when a failed request was refused for its login method; null for any other error. */
export const loginMethodRequiredMessage = (err: unknown): string | null => {
  const body = apiErrorBody(err)
  return body.errorCode === LOGIN_METHOD_REQUIRED_CODE
    ? (body.message ?? DEFAULT_LOGIN_METHOD_MESSAGE)
    : null
}
