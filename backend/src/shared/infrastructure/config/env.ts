const config = {
  database: {
    url: process.env.DATABASE_URL || '',
  },
  auth: {
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET || '',
    accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY || '100h',
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || '',
    refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || '7d',
    saltRounds: parseInt(process.env.SALT_ROUNDS || '10', 10),
    magicLinkExpiryMinutes: parseInt(
      process.env.MAGIC_LINK_EXPIRY_MINUTES || process.env.MAGIC_LINK_EXPIRY || '10',
      10
    ),
  },
  server: {
    port: parseInt(process.env.PORT || '8081', 10),
    nodeEnv:
      (process.env.NODE_ENV as 'development' | 'production' | 'test') ||
      'development',
    frontendUrl: process.env.FRONTEND_URL?.replace(/\/+$/, '') || '',
  },
  redis: {
    url: process.env.REDIS_URL || '',
    caCert: process.env.REDIS_CA_CERT || '',
    tlsRejectUnauthorized:
      (process.env.REDIS_TLS_REJECT_UNAUTHORIZED ?? 'true').toLowerCase() !==
      'false',
  },
  ml: {
    internalUrl: process.env.ML_INTERNAL_URL || '',
  },
  finnhub: {
    apiKey: process.env.FINNHUB_API_KEY || '',
    quoteTTL: parseInt(process.env.FINNHUB_QUOTE_TTL || '30', 10),
  },
  alphavantage: {
    apiKey: process.env.ALPHAVANTAGE_API_KEY || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    otpTTL: parseInt(process.env.OTP_TTL || '30', 10),
  },
  fmp: {
    apiKey: process.env.FMP_API_KEY || '',
  },
  polygon: {
    apiKey: process.env.POLYGON_API_KEY || '',
  },
  twelveData: {
    apiKey: process.env.TWELVE_DATA_API_KEY || '',
  }
}

// Validation for required variables
const requiredVariables = [
  "DATABASE_URL",
  "PORT",
  "ACCESS_TOKEN_SECRET",
  "REFRESH_TOKEN_SECRET",
];

requiredVariables.forEach((variable) => {
  if (!process.env[variable]) {
    throw new Error(`Missing required environment variable: ${variable}`);
  }
});

export default config;
