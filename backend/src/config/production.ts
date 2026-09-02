// Non-sensitive settings for production.

export const productionConfig = {
  env: 'production' as const,
  server: {
    port: 8081,
    logLevel: 'info' as const,
    trustProxy: true,
    frontendUrl: 'https://stockpros-platform.vercel.app',
  },
  auth: {
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '30d',
    magicLinkExpiryMinutes: 10,
  },
  redis: {
    tlsRejectUnauthorized: true,
  },
  cache: {
    enabled: true,
    ttlMultiplier: 1.0,
  },
  ml: {
    internalUrl: 'https://ai-service-oylj.onrender.com',
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
    useSmtp: false,
    useResend: true,
    resendFrom: 'StockPros <onboarding@resend.dev>',
  },
  features: {
    enableNewsCron: true,
    enableWatchlistCron: true,
    enableAiRecomputeCron: true,
    enableSwaggerDocs: process.env.ENABLE_SWAGGER_DOCS !== 'false',
  },
  audit: {
    retentionDays: 30, // change 30d to 7 year in paid plan
  },
}
