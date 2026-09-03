import config from '@/config'

export const REFRESH_COOKIE_NAME = 'refresh_token'

export const defaultCookieOptions = {
  httpOnly: true,
  secure: config.server.nodeEnv === 'production', // must be true in prod for SameSite=None
  sameSite:
    config.server.nodeEnv === 'production'
      ? ('none' as const)
      : ('lax' as const),
  path: '/',
}

/** Scoped specifically to the authentication route hierarchy to keep API calls lean and secure */
export const refreshCookieOptions = {
  ...defaultCookieOptions,
  path: '/api/v1/auth',
}
