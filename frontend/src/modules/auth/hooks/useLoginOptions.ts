import { useEffect, useState } from 'react'
import { getLoginOptions } from '../services'
import { DomainAuthPolicy, type LoginOptions } from '../types'
import { loginSchema } from '../validation'

const LOOKUP_DEBOUNCE_MS = 400

const UNRESTRICTED: LoginOptions = {
  authPolicy: DomainAuthPolicy.ANY,
  ssoAvailable: false,
}

/**
 * How the typed email's domain lets people sign in (policy and SSO). Looks up
 * only once the email is valid and typing has paused; a response for an
 * earlier email is dropped.
 */
export const useLoginOptions = (email: string): LoginOptions => {
  const [result, setResult] = useState<{
    email: string
    options: LoginOptions
  } | null>(null)

  useEffect(() => {
    const parsed = loginSchema.safeParse({ email })
    if (!parsed.success) return
    const normalized = parsed.data.email
    let stale = false
    const timer = setTimeout(() => {
      void getLoginOptions(normalized).then((options) => {
        if (!stale) setResult({ email: normalized, options })
      })
    }, LOOKUP_DEBOUNCE_MS)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [email])

  const parsed = loginSchema.safeParse({ email })
  return parsed.success && result?.email === parsed.data.email
    ? result.options
    : UNRESTRICTED
}
