const mockLogger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() }

jest.mock('../../logger', () => ({ logger: mockLogger }))

const loadRedisConfig = (overrides: Record<string, unknown>) => {
  jest.resetModules()
  jest.doMock('@/config', () => {
    const actual = jest.requireActual('@/config')
    const patched = {
      ...actual.default,
      redis: { ...actual.default.redis, ...overrides },
    }
    return { __esModule: true, default: patched, config: patched }
  })
  return jest.requireActual('../redis') as typeof import('../redis')
}

beforeEach(() => jest.clearAllMocks())

describe('finalOpts — TLS detection', () => {
  it('disables TLS for a plain redis:// URL', () => {
    const { finalOpts } = loadRedisConfig({
      url: 'redis://localhost:6379',
      tlsRejectUnauthorized: true,
    })
    expect(finalOpts.tls).toBeUndefined()
  })

  it('enables TLS with the configured rejectUnauthorized for a rediss:// URL', () => {
    const { finalOpts } = loadRedisConfig({
      url: 'rediss://prod-host:6380',
      tlsRejectUnauthorized: false,
    })
    expect(finalOpts.tls).toEqual({ rejectUnauthorized: false })
  })

  it('warns and disables TLS when the URL is malformed', () => {
    const { finalOpts } = loadRedisConfig({ url: 'not a valid url' })
    expect(finalOpts.tls).toBeUndefined()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Invalid REDIS_URL format. TLS may not be configured correctly.',
    )
  })

  it('disables TLS when no URL is configured at all', () => {
    const { finalOpts } = loadRedisConfig({ url: '' })
    expect(finalOpts.tls).toBeUndefined()
  })

  it('sets fixed connection options regardless of TLS', () => {
    const { finalOpts } = loadRedisConfig({ url: 'redis://localhost:6379' })
    expect(finalOpts).toMatchObject({
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      family: 4,
      enableReadyCheck: false,
    })
  })
})

describe('finalOpts.retryStrategy', () => {
  it('backs off linearly up to the 5s cap', () => {
    const { finalOpts } = loadRedisConfig({ url: 'redis://localhost:6379' })
    expect(finalOpts.retryStrategy!(1)).toBe(2000)
    expect(finalOpts.retryStrategy!(3)).toBe(5000)
  })

  it('gives up after 3 retries', () => {
    const { finalOpts } = loadRedisConfig({ url: 'redis://localhost:6379' })
    expect(finalOpts.retryStrategy!(4)).toBeNull()
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Redis retry limit reached after 4 attempts',
    )
  })
})

// Makes this file a module so its top-level helpers do not collide with other
// import-less test files in the shared ts-jest program (TS2451).
export {}
