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
import '../twelve-data-client'

const mockAxiosRetry = axiosRetry as unknown as jest.Mock
const retryOptions = mockAxiosRetry.mock.calls[0][1]

describe('twelve-data-client — module setup', () => {
  it('creates the axios instance with the Twelve Data base URL and API key param', () => {
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.twelvedata.com',
        params: { apikey: 'test' },
      }),
    )
  })

  it('throws at load time when TWELVE_DATA_API_KEY is not configured', () => {
    jest.resetModules()
    jest.doMock('@/config', () => {
      const actual = jest.requireActual('@/config')
      const patched = {
        ...actual.default,
        twelveData: { ...actual.default.twelveData, apiKey: '' },
      }
      return { __esModule: true, default: patched, config: patched }
    })
    expect(() => jest.requireActual('../twelve-data-client')).toThrow(
      'Twelve Data API key is not configured in env.',
    )
  })
})

describe('twelve-data-client — retry policy', () => {
  it('retries on 429/502/503/504 responses', () => {
    for (const status of [429, 502, 503, 504]) {
      expect(retryOptions.retryCondition({ response: { status } })).toBe(true)
    }
  })

  it('does not retry on a non-retriable status', () => {
    expect(
      retryOptions.retryCondition({
        response: { status: 400 },
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

  it('retries a plain network error via isNetworkOrIdempotentRequestError', () => {
    expect(
      retryOptions.retryCondition({
        code: 'ECONNRESET',
        message: 'socket hang up',
      }),
    ).toBe(true)
  })

  it('logs a warning on each retry attempt', () => {
    retryOptions.onRetry(1, new Error('timeout'), { url: '/time_series' })
    expect(logger.warn).toHaveBeenCalledWith(
      '[TwelveDataClient] Retry 1 for /time_series: timeout',
    )
  })
})
