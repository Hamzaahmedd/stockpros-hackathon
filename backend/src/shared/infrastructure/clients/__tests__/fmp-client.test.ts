jest.mock('axios', () => ({
  __esModule: true,
  default: { create: jest.fn(() => ({})) },
}))

jest.mock('axios-retry', () => {
  const actual = jest.requireActual('axios-retry')
  return { __esModule: true, default: Object.assign(jest.fn(), actual.default) }
})

jest.mock('../../logger', () => ({
  logger: { warn: jest.fn() },
}))

import axios from 'axios'
import axiosRetry from 'axios-retry'
import { logger } from '../../logger'
import '../fmp-client'

const mockAxiosRetry = axiosRetry as unknown as jest.Mock
const retryOptions = mockAxiosRetry.mock.calls[0][1]

describe('fmp-client — module setup', () => {
  it('creates the axios instance with the FMP base URL and API key param', () => {
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://financialmodelingprep.com/stable',
        params: { apikey: 'test' },
      }),
    )
  })

  it('throws at load time when FMP_API_KEY is not configured', () => {
    jest.resetModules()
    jest.doMock('@/config', () => {
      const actual = jest.requireActual('@/config')
      const patched = {
        ...actual.default,
        fmp: { ...actual.default.fmp, apiKey: '' },
      }
      return { __esModule: true, default: patched, config: patched }
    })
    expect(() => jest.requireActual('../fmp-client')).toThrow(
      'CRITICAL: FMP API key is not configured in environment variables.',
    )
  })
})

describe('fmp-client — retry policy', () => {
  it('retries on 429/502/503/504 responses', () => {
    for (const status of [429, 502, 503, 504]) {
      expect(retryOptions.retryCondition({ response: { status } })).toBe(true)
    }
  })

  it('does not retry on a non-retriable status via the response-status check', () => {
    expect(
      retryOptions.retryCondition({
        response: { status: 400 },
        request: {},
        config: {},
        message: 'bad request',
      }),
    ).toBe(false)
  })

  it('does not retry an error with neither a response nor a recognizable network error code', () => {
    expect(
      retryOptions.retryCondition({ config: {}, message: 'unknown failure' }),
    ).toBe(false)
  })

  it('retries a plain network error (no response at all) via isNetworkOrIdempotentRequestError', () => {
    expect(
      retryOptions.retryCondition({
        code: 'ECONNRESET',
        message: 'socket hang up',
      }),
    ).toBe(true)
  })

  it('logs a warning on each retry attempt', () => {
    retryOptions.onRetry(1, new Error('timeout'), { url: '/quote/AAPL' })
    expect(logger.warn).toHaveBeenCalledWith(
      '[FmpClient] Retry 1 for /quote/AAPL: timeout',
    )
  })
})
