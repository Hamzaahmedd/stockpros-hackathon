import config from '@/config'
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { logger } from '../logger'

const FINNHUB_API_KEY = config.finnhub.apiKey

if (!FINNHUB_API_KEY) {
  throw new Error('Finnhub API key is not configured in env.')
}

const finnhubClient = axios.create({
  baseURL: 'https://finnhub.io/api/v1',
  params: {
    token: FINNHUB_API_KEY,
  },
  timeout: 10000, // 10 seconds
})

// Rate limit queue: enforce a minimum gap between outbound Finnhub requests
const MIN_REQUEST_INTERVAL_MS = 100 // max ~10 req/s to stay comfortably below 30 req/s limit
let lastRequestTime = 0
let pendingQueuePromise = Promise.resolve()

const throttleRequest = async (): Promise<void> => {
  pendingQueuePromise = pendingQueuePromise.then(async () => {
    const now = Date.now()
    const elapsed = now - lastRequestTime
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed),
      )
    }
    lastRequestTime = Date.now()
  })
  return pendingQueuePromise
}

finnhubClient.interceptors.request.use(async (reqConfig) => {
  await throttleRequest()
  return reqConfig
})

// Auto-retry interceptor for 429 & 503 (rate limit / Cloudflare)
interface RetryConfig extends InternalAxiosRequestConfig {
  _retryCount?: number
}

finnhubClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryConfig | undefined
    if (!originalRequest) throw error

    const status = error.response?.status
    const isRateLimited = status === 429 || status === 503

    if (isRateLimited) {
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1

      if (originalRequest._retryCount <= 3) {
        const retryAfterHeader = error.response?.headers?.['retry-after']
        const retryAfterSec = retryAfterHeader
          ? Number.parseInt(String(retryAfterHeader), 10)
          : null

        // Cap maximum retry delay to 3s so development or requests don't hang for 60s
        const rawDelayMs =
          retryAfterSec && !Number.isNaN(retryAfterSec)
            ? Math.min(retryAfterSec * 1000, 3000)
            : originalRequest._retryCount * 1000
        const delayMs = Math.min(rawDelayMs, 3000)

        logger.warn(
          `[FinnhubClient] Rate limited (${status}) for ${originalRequest.url}. Retrying in ${delayMs}ms (Attempt ${originalRequest._retryCount}/3)...`,
        )

        await new Promise((resolve) => setTimeout(resolve, delayMs))
        return finnhubClient(originalRequest)
      }
    }

    throw error
  },
)

export default finnhubClient

