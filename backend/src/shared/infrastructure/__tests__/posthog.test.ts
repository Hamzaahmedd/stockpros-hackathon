const mockCapture = jest.fn()
const mockPostHogCtor = jest.fn().mockImplementation(() => ({
  capture: mockCapture,
}))

jest.mock('posthog-node', () => ({
  __esModule: true,
  PostHog: mockPostHogCtor,
}))

const loadPosthog = (overrides: {
  server?: Record<string, unknown>
  posthog?: Record<string, unknown>
}) => {
  jest.resetModules()
  jest.doMock('@/config', () => {
    const actual = jest.requireActual('@/config')
    const patched = {
      ...actual.config,
      server: { ...actual.config.server, ...(overrides.server || {}) },
      posthog: { ...actual.config.posthog, ...(overrides.posthog || {}) },
    }
    return { __esModule: true, default: patched, config: patched }
  })
  return jest.requireActual('../posthog') as typeof import('../posthog')
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('posthogClient', () => {
  it('is null outside production, even with an API key configured', () => {
    const { posthogClient } = loadPosthog({
      server: { nodeEnv: 'test' },
      posthog: { apiKey: 'phc_test' },
    })
    expect(posthogClient).toBeNull()
    expect(mockPostHogCtor).not.toHaveBeenCalled()
  })

  it('is null in production when no API key is configured', () => {
    const { posthogClient } = loadPosthog({
      server: { nodeEnv: 'production' },
      posthog: { apiKey: '' },
    })
    expect(posthogClient).toBeNull()
  })

  it('is constructed only in production with an API key present', () => {
    const { posthogClient } = loadPosthog({
      server: { nodeEnv: 'production' },
      posthog: { apiKey: 'phc_test', host: 'https://posthog.example' },
    })
    expect(posthogClient).not.toBeNull()
    expect(mockPostHogCtor).toHaveBeenCalledWith('phc_test', {
      host: 'https://posthog.example',
      flushAt: 1,
      flushInterval: 0,
    })
  })
})

describe('captureEvent', () => {
  it('is a no-op when there is no active client', () => {
    const { captureEvent } = loadPosthog({ server: { nodeEnv: 'test' } })
    expect(() => captureEvent('user-1', 'user_signed_in' as any)).not.toThrow()
    expect(mockCapture).not.toHaveBeenCalled()
  })

  it('forwards to the client when active', () => {
    const { captureEvent } = loadPosthog({
      server: { nodeEnv: 'production' },
      posthog: { apiKey: 'phc_test' },
    })
    captureEvent('user-1', 'user_signed_in' as any, { plan: 'PRO' })
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: 'user-1',
      event: 'user_signed_in',
      properties: { plan: 'PRO' },
    })
  })
})

// Makes this file a module so its top-level helpers do not collide with other
// import-less test files in the shared ts-jest program (TS2451).
export {}
