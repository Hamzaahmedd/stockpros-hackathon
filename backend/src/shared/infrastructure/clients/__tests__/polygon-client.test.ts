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
import '../polygon-client'

const mockAxiosRetry = axiosRetry as unknown as jest.Mock
const retryOptions = mockAxiosRetry.mock.calls[0][1]

describe('polygon-client — module setup', () => {
  it('creates the axios instance with the Polygon base URL and API key param', () => {
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.polygon.io',
        params: { apiKey: 'test' },
      }),
    )
  })
})

describe('polygon-client — retry policy', () => {
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
    retryOptions.onRetry(1, new Error('timeout'), { url: '/v2/aggs' })
    expect(logger.warn).toHaveBeenCalledWith(
      '[PolygonClient] Retry 1 for /v2/aggs: timeout',
    )
  })
})
