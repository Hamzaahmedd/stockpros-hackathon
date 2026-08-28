import config from '@/config'

export const defaultCookieOptions = {
  httpOnly: true,
  secure: config.server.nodeEnv === 'production', // must be true in prod for SameSite=None
  sameSite:
    config.server.nodeEnv === 'production'
      ? ('none' as const)
      : ('lax' as const),
  path: '/',
}
