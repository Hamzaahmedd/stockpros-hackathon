/**
 * Test bootstrap: sets minimal environment variables so the config module
 * loads cleanly in the test environment without requiring real secrets.
 *
 * These are never committed with real values — they exist solely to satisfy
 * the config loader (which skips secret validation in NODE_ENV=test anyway).
 */
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret'
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret'
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id'
process.env.REDIS_URL = 'redis://localhost:6379'
process.env.SMTP_USER = 'test'
process.env.SMTP_PASS = 'test'
process.env.RESEND_API_KEY = 'test'
process.env.FINNHUB_API_KEY = 'test'
process.env.FMP_API_KEY = 'test'
process.env.POLYGON_API_KEY = 'test'
process.env.TWELVE_DATA_API_KEY = 'test'
