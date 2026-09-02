// Non-sensitive settings for local development.

export const developmentConfig = {
  env: 'development' as const,
  server: {
    port: 3000,
    logLevel: 'debug' as const,
    trustProxy: true,
    frontendUrl: 'http://localhost:5173',
  },
  auth: {
    accessTokenExpiry: '7d',
    refreshTokenExpiry: '7d',
    magicLinkExpiryMinutes: 10,
  },
  redis: {
    tlsRejectUnauthorized: false,
  },
  cache: {
    enabled: true,
    ttlMultiplier: 1.0,
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
  },
  brand: {
    logoUrl:
      'https://weyddqoxrfdtgmbcnzew.supabase.co/storage/v1/object/public/public-assets/stockpros-logo.png',
  },
  email: {
    useSmtp: true,
    useResend: false,
    resendFrom: 'StockPros <onboarding@resend.dev>',
  },
  features: {
    enableNewsCron: true,
    enableWatchlistCron: true,
    enableAiRecomputeCron: true,
    enableSwaggerDocs: true,
  },
  audit: {
    retentionDays: 30,
  },
}
