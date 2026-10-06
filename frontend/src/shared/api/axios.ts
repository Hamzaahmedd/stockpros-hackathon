// src/api/axios.ts
import axios, { AxiosError } from 'axios'
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from '@/shared/utils/token'
import { API_URL } from '../config'
import { readApiErrorBody } from '@/shared/utils/api-error'
import { readOrgContext, setOrgContext } from '@/shared/utils/org-context-store'
import { isQueuedComputeRoute, queuedComputeTimeout } from './timeouts'
import { toast } from 'react-toastify'
import {
  OVERAGE_REQUIRED_CODE,
  dispatchOverageRequired,
  isOverageRequiredDetails,
} from '@/shared/utils/overage-events'

// Marks a request already retried after a token refresh. Axios copies unknown config
// fields when `api(original)` rebuilds the config, so the marker survives the retry.
declare module 'axios' {
  interface AxiosRequestConfig {
    _retry?: boolean
  }
}

const PLAN_GATED_ERROR_CODES = new Set([
  'QuotaExceededError',
  'PlanRequiredError',
])

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// REQUEST INTERCEPTOR

// Add Authorization header automatically
api.interceptors.request.use((config) => {
  // Outwait the backend priority queue (20 s) on the queued compute routes, unless a caller set its own timeout.
  if (!config.timeout) {
    const timeout = queuedComputeTimeout(config.url, config.method)
    if (timeout !== undefined) config.timeout = timeout
  }
  const token = getAccessToken() // function to read token from memory
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// REFRESH TOKEN LOGIC

let isRefreshing = false
let queue: Array<{
  resolve: (value?: unknown) => void
  reject: (reason?: unknown) => void
}> = []

const processQueue = (err: any) => {
  queue.forEach((p) => (err ? p.reject(err) : p.resolve(null)))
  queue = []
}

// RESPONSE INTERCEPTOR

api.interceptors.response.use(
  (res) => {
    // Team members get the workspace's AI instructions on forecast / decision
    // responses; a response without them (non-team, or left the workspace) clears it.
    if (isQueuedComputeRoute(res.config?.url, res.config?.method)) {
      setOrgContext(readOrgContext(res.data))
    }
    return res
  },
  async (err: AxiosError) => {
    const original = err.config
    if (!original) return Promise.reject(err)
    const url = original.url || ''

    // 1) If /me returns 401 and user has no accessToken, do NOT refresh
    if (url.includes('api/v1/auth/me')) {
      return Promise.reject(err)
    }

    // Surface plan/quota gating as an upsell toast pointing at /plans, for any
    // request that hits a Free-tier limit (forecast quota, watchlist cap,
    // decision-support watchlist-only restriction, Pro-only feature lock).
    const body = readApiErrorBody(err.response?.data)
    const errorCode = body.errorCode
    if (errorCode && PLAN_GATED_ERROR_CODES.has(errorCode)) {
      const message = body.message || 'This requires a Pro plan'
      toast.warn(`${message} — visit Plans to upgrade to Pro`)
    }

    // Quota + credits exhausted: offer a top-up dialog when the caller can buy
    // credits, otherwise tell them to ask their workspace admin.
    if (errorCode === OVERAGE_REQUIRED_CODE) {
      const { details } = body
      if (isOverageRequiredDetails(details) && details.canTopUp) {
        dispatchOverageRequired(details)
      } else {
        toast.warn(
          "Your workspace's AI credits are used up — ask a workspace admin to top up",
        )
      }
    }

    // 2) Only refresh for protected APIs
    if (err.response?.status === 401 && !original._retry) {
      if (!getAccessToken()) {
        return Promise.reject(err)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject })
        }).then(() => api(original))
      }

      original._retry = true
      isRefreshing = true
      try {
        const refreshRes = await axios.post(
          `${API_URL}/api/v1/auth/refresh-token`,
          {},
          { withCredentials: true },
        )

        if (refreshRes.data?.accessToken) {
          setAccessToken(refreshRes.data.accessToken)
        }
        processQueue(null)
        return api(original)
      } catch (e) {
        clearAccessToken()
        processQueue(e)
        return Promise.reject(e)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(err)
  },
)

export default api
