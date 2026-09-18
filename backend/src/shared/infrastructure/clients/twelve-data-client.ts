import config from '@/config'
import axios from 'axios'
import axiosRetry from 'axios-retry'
import { logger } from '../logger'

const TWELVE_DATA_API_KEY = config.twelveData.apiKey

if (!TWELVE_DATA_API_KEY) {
  throw new Error('Twelve Data API key is not configured in env.')
}

const twelveDataClient = axios.create({
  baseURL: 'https://api.twelvedata.com',
  params: {
    apikey: TWELVE_DATA_API_KEY,
  },
  timeout: 10000,
})

// Absorb transient network blips / 429s / 5xx before callers' own fallback
// logic (e.g. ATR estimates) has to kick in.
//
// The cast below works around a ts-jest-only type-resolution quirk (see the
// identical comment in fmp-client.ts for the full explanation) — the real
// build (`tsc --noEmit`) is clean without it.
axiosRetry(twelveDataClient as Parameters<typeof axiosRetry>[0], {
  retries: 2,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    [429, 502, 503, 504].includes(error.response?.status ?? 0),
  onRetry: (retryCount, error, requestConfig) =>
    logger.warn(
      `[TwelveDataClient] Retry ${retryCount} for ${requestConfig.url}: ${error.message}`,
    ),
})

export default twelveDataClient
