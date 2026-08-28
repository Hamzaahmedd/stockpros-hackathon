// Non-sensitive settings for production.
// ml.internalUrl and email.resendFrom must be set to real values before deploy.
import type { EnvConfig } from './types'

export const productionConfig: EnvConfig = {
  env: 'production',
  server: {
    port: 8081,
    logLevel: 'info',
    trustProxy: true,
    frontendUrl: 'https://stockpros-platform.vercel.app',
  },
  auth: {
    accessTokenExpiry: '1h',
    refreshTokenExpiry: '30d',
    saltRounds: 12,
    magicLinkExpiryMinutes: 10,
  },
  redis: {
    tlsRejectUnauthorized: true,
  },
  cache: {
    quoteTtlSeconds: 30,
    responseTtlSeconds: 3600,
  },
  ml: {
    internalUrl: 'http://ml-service.internal:8000',
  },
  finnhub: {
    quoteTTL: 30,
  },
  smtp: {
    host: 'smtp.gmail.com',
    port: 587,
    otpTTL: 30,
  },
  email: {
    resendFrom: 'StockPros <no-reply@stockpros.app>',
    fromAddress: '',
    logoUrl:
      'https://weyddqoxrfdtgmbcnzew.supabase.co/storage/v1/object/public/public-assets/stockpros-logo.png',
  },
  features: {
    enableNewsCron: true,
    enableWatchlistCron: true,
    enableAiRecomputeCron: true,
  },
}
