import config from '@/config'
import axios from 'axios'
import axiosRetry from 'axios-retry'
import { logger } from '../logger'

const ML_INTERNAL_URL = config.ml.internalUrl

if (!ML_INTERNAL_URL) {
  throw new Error('ML internal URL is not configured in env.')
}

const mlClient = axios.create({
  baseURL: ML_INTERNAL_URL,
  timeout: 30000, // ML training/inference can take longer
})

// Absorb transient network blips / 429s / 5xx from the internal AI service.
//
// The cast below works around a ts-jest-only type-resolution quirk (see the
// identical comment in fmp-client.ts for the full explanation) — the real
// build (`tsc --noEmit`) is clean without it.
axiosRetry(mlClient as Parameters<typeof axiosRetry>[0], {
  retries: 2,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    [429, 502, 503, 504].includes(error.response?.status ?? 0),
  onRetry: (retryCount, error, requestConfig) =>
    logger.warn(
      `[MlClient] Retry ${retryCount} for ${requestConfig.url}: ${error.message}`,
    ),
})

export default mlClient
