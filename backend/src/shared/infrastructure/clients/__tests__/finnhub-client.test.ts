jest.mock('axios', () => {
  const instance: any = jest.fn()
  instance.interceptors = {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  }
  return {
    __esModule: true,
    default: { create: jest.fn(() => instance) },
  }
})

jest.mock('../../logger', () => ({
  logger: { warn: jest.fn() },
}))

import axios from 'axios'
import { logger } from '../../logger'
import finnhubClient from '../finnhub-client'

const mockInstance = finnhubClient as unknown as jest.Mock & {
  interceptors: {
    request: { use: jest.Mock }
    response: { use: jest.Mock }
  }
}

const reqFulfilled = mockInstance.interceptors.request.use.mock.calls[0][0]
const [resFulfilled, resRejected] =
  mockInstance.interceptors.response.use.mock.calls[0]

describe('finnhub-client — module setup', () => {
  it('throws at load time when FINNHUB_API_KEY is not configured', () => {
    jest.resetModules()
    jest.doMock('@/config', () => {
      const actual = jest.requireActual('@/config')
      const patched = {
        ...actual.default,
        finnhub: { ...actual.default.finnhub, apiKey: '' },
      }
      return { __esModule: true, default: patched, config: patched }
    })
    expect(() => jest.requireActual('../finnhub-client')).toThrow(
      'Finnhub API key is not configured in env.',
    )
  })

  it('creates the axios instance with the Finnhub base URL and API key param', () => {
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://finnhub.io/api/v1',
        params: { token: 'test' },
      }),
    )
  })
})

describe('finnhub-client — request throttling', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('passes the request config through unchanged', async () => {
    const config = { url: '/quote' }
    const result = await reqFulfilled(config)
    expect(result).toBe(config)
  })

  it('delays a request that arrives before the minimum interval has elapsed', async () => {
    const p1 = reqFulfilled({ url: '/a' })
    const p2 = reqFulfilled({ url: '/b' })

    await jest.runAllTimersAsync()

    await expect(p1).resolves.toEqual({ url: '/a' })
    await expect(p2).resolves.toEqual({ url: '/b' })
  })
})

describe('finnhub-client — response interceptor passthrough', () => {
  it('passes a successful response through unchanged', () => {
    const response = { data: {}, status: 200 }
    expect(resFulfilled(response)).toBe(response)
  })
})

describe('finnhub-client — retry-on-error interceptor', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('rethrows immediately when the error has no request config at all', async () => {
    const error = { config: undefined, response: { status: 429 } }
    await expect(resRejected(error)).rejects.toBe(error)
  })

  it('rethrows immediately for a non-retriable status code', async () => {
    const error = { config: { url: '/quote' }, response: { status: 400 } }
    await expect(resRejected(error)).rejects.toBe(error)
    expect(mockInstance).not.toHaveBeenCalled()
  })

  it('retries a 429 using the retry-after header, capped at 3s, and logs a warning', async () => {
    const originalRequest: any = { url: '/quote', _retryCount: undefined }
    const error = {
      config: originalRequest,
      response: { status: 429, headers: { 'retry-after': '10' } },
    }
    mockInstance.mockResolvedValueOnce({ data: 'retried-ok' })

    const resultPromise = resRejected(error)
    await jest.runAllTimersAsync()
    const result = await resultPromise

    expect(result).toEqual({ data: 'retried-ok' })
    expect(originalRequest._retryCount).toBe(1)
    expect(mockInstance).toHaveBeenCalledWith(originalRequest)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Retrying in 3000ms (Attempt 1/3)'),
    )
  })

  it('retries a 502/503 with an exponential-ish default backoff when no retry-after header is present', async () => {
    const originalRequest: any = { url: '/quote' }
    const error = { config: originalRequest, response: { status: 502 } }
    mockInstance.mockResolvedValueOnce({ data: 'ok' })

    const resultPromise = resRejected(error)
    await jest.runAllTimersAsync()
    await resultPromise

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Retrying in 1000ms (Attempt 1/3)'),
    )
  })

  it('ignores a non-numeric retry-after header and falls back to the default backoff', async () => {
    const originalRequest: any = { url: '/quote' }
    const error = {
      config: originalRequest,
      response: { status: 503, headers: { 'retry-after': 'not-a-number' } },
    }
    mockInstance.mockResolvedValueOnce({ data: 'ok' })

    const resultPromise = resRejected(error)
    await jest.runAllTimersAsync()
    await resultPromise

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Retrying in 1000ms (Attempt 1/3)'),
    )
  })

  it('gives up and rethrows after 3 retries', async () => {
    const originalRequest: any = { url: '/quote', _retryCount: 3 }
    const error = { config: originalRequest, response: { status: 429 } }

    await expect(resRejected(error)).rejects.toBe(error)
    expect(mockInstance).not.toHaveBeenCalled()
  })
})
