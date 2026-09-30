const mockGroqCtor = jest.fn().mockImplementation(() => ({ __fake: true }))

jest.mock('groq-sdk', () => ({
  __esModule: true,
  default: mockGroqCtor,
}))

jest.mock('../../logger', () => ({
  logger: { warn: jest.fn() },
}))

const loadClient = (apiKey: string) => {
  jest.resetModules()
  jest.doMock('@/config', () => {
    const actual = jest.requireActual('@/config')
    const patched = {
      ...actual.default,
      groq: { ...actual.default.groq, apiKey },
    }
    return { __esModule: true, default: patched, config: patched }
  })
  return jest.requireActual('../groq-client') as typeof import('../groq-client')
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getGroqClient', () => {
  it('returns null and warns when GROQ_API_KEY is not configured', () => {
    const { getGroqClient } = loadClient('')
    const { logger } = jest.requireMock('../../logger') as {
      logger: { warn: jest.Mock }
    }

    const result = getGroqClient()

    expect(result).toBeNull()
    expect(logger.warn).toHaveBeenCalled()
    expect(mockGroqCtor).not.toHaveBeenCalled()
  })

  it('constructs a Groq client once and reuses it on subsequent calls', () => {
    const { getGroqClient } = loadClient('live-key')

    const first = getGroqClient()
    const second = getGroqClient()

    expect(first).toBe(second)
    expect(mockGroqCtor).toHaveBeenCalledTimes(1)
    expect(mockGroqCtor).toHaveBeenCalledWith({ apiKey: 'live-key' })
  })
})

// Makes this file a module so its top-level helpers do not collide with other
// import-less test files in the shared ts-jest program (TS2451).
export {}
