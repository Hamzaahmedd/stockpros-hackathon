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
    // Global scale applied to every domain TTL in
    // shared/constants/cache-constants.ts (0 disables expiring writes).
    ttlMultiplier: 1,
  },
  ml: {
    internalUrl: 'http://localhost:8000',
  },
  smtp: {
    host: 'smtp.gmail.com',
    port: 587,
  },
  email: {
    useSmtp: true,
    useResend: false,
    resendFrom: 'StockPros <onboarding@resend.dev>',
    logoUrl:
      'https://weyddqoxrfdtgmbcnzew.supabase.co/storage/v1/object/public/public-assets/stockpros-logo.png',
  },
  features: {
    enableNewsCron: true,
    enableWatchlistCron: true,
    enableAiRecomputeCron: true,
    enableSwaggerDocs: true,
  },
}
