// Non-sensitive settings for local development.
import type { EnvConfig } from './types'

export const developmentConfig: EnvConfig = {
  env: 'development',
  server: {
    port: 3000,
    logLevel: 'debug',
    trustProxy: true,
    frontendUrl: 'http://localhost:5173',
  },
  auth: {
    accessTokenExpiry: '7d',
    refreshTokenExpiry: '7d',
    saltRounds: 10,
    magicLinkExpiryMinutes: 10,
  },
  redis: {
    tlsRejectUnauthorized: false,
  },
  cache: {
    quoteTtlSeconds: 30,
    responseTtlSeconds: 60,
  },
  ml: {
    internalUrl: 'http://localhost:8000',
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
    resendFrom: 'StockPros <onboarding@resend.dev>',
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
