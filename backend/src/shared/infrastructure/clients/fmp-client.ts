import config from '@/config'
import axios from 'axios'
import axiosRetry from 'axios-retry'
import { logger } from '../logger'

const FMP_API_KEY = config.fmp.apiKey

if (!FMP_API_KEY) {
  throw new Error(
    'CRITICAL: FMP API key is not configured in environment variables.',
  )
}

const fmpClient = axios.create({
  baseURL: 'https://financialmodelingprep.com/stable',
  params: {
    apikey: FMP_API_KEY,
  },
  timeout: 10000,
})

// Absorb transient network blips / 429s / 5xx before callers' own fallback
// logic (e.g. beta estimates) has to kick in.
//
// The cast below works around a ts-jest-only type-resolution quirk: ts-jest's
// per-file program construction doesn't merge axios-retry's `declare module
// 'axios'` augmentation the same way a full `tsc` project compile does, so it
// sees two structurally-identical-but-nominally-different `AxiosInstance`
// types. `npx tsc --noEmit` (the real build) is clean without this cast —
// confirmed by running it directly against both tsconfig.json and
// tsconfig.test.json — so this is purely a test-tooling artifact, not a real
// type error.
axiosRetry(fmpClient as Parameters<typeof axiosRetry>[0], {
  retries: 2,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    [429, 502, 503, 504].includes(error.response?.status ?? 0),
  onRetry: (retryCount, error, requestConfig) =>
    logger.warn(
      `[FmpClient] Retry ${retryCount} for ${requestConfig.url}: ${error.message}`,
    ),
})

export default fmpClient
