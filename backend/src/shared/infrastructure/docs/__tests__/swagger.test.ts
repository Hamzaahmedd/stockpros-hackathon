const mockExistsSync = jest.fn<boolean, any[]>()
const mockReadFileSync = jest.fn<string, any[]>()

jest.mock('node:fs', () => ({
  __esModule: true,
  default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}))

const mockServe = ['serve-mw']
const mockSetup = jest.fn(() => 'setup-mw')

jest.mock('swagger-ui-express', () => ({
  __esModule: true,
  default: { serve: mockServe, setup: mockSetup },
  serve: mockServe,
  setup: mockSetup,
}))

const loadSwagger = (featuresOverrides: Record<string, unknown>) => {
  jest.resetModules()
  jest.doMock('@/config', () => {
    const actual = jest.requireActual('@/config')
    const patched = {
      ...actual.default,
      features: { ...actual.default.features, ...featuresOverrides },
    }
    return { __esModule: true, default: patched, config: patched }
  })
  return jest.requireActual('../swagger') as typeof import('../swagger')
}

const mockApp = () => ({ use: jest.fn(), get: jest.fn() }) as any

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getSwaggerSpec', () => {
  it('returns null when the generated spec file does not exist', () => {
    mockExistsSync.mockReturnValue(false)
    const { getSwaggerSpec } = loadSwagger({})
    expect(getSwaggerSpec()).toBeNull()
  })

  it('parses the spec and patches the servers entry with the local port', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ openapi: '3.0.0' }))
    const { getSwaggerSpec } = loadSwagger({})

    const spec = getSwaggerSpec()

    expect(spec?.openapi).toBe('3.0.0')
    expect(spec?.servers).toEqual([
      expect.objectContaining({ description: 'Local Development Server' }),
    ])
  })

  it('returns null when the spec file contains invalid JSON', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{not valid json')
    const { getSwaggerSpec } = loadSwagger({})

    expect(getSwaggerSpec()).toBeNull()
  })
})

describe('setupSwaggerDocs', () => {
  it('does nothing when the feature flag is disabled', () => {
    const { setupSwaggerDocs } = loadSwagger({ enableSwaggerDocs: false })
    const app = mockApp()

    setupSwaggerDocs(app)

    expect(app.use).not.toHaveBeenCalled()
    expect(app.get).not.toHaveBeenCalled()
  })

  it('does nothing when the feature flag is enabled but the spec is unavailable', () => {
    mockExistsSync.mockReturnValue(false)
    const { setupSwaggerDocs } = loadSwagger({ enableSwaggerDocs: true })
    const app = mockApp()

    setupSwaggerDocs(app)

    expect(app.use).not.toHaveBeenCalled()
    expect(app.get).not.toHaveBeenCalled()
  })

  it('mounts the JSON and UI routes when enabled and the spec is available', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ openapi: '3.0.0' }))
    const { setupSwaggerDocs } = loadSwagger({ enableSwaggerDocs: true })
    const app = mockApp()

    setupSwaggerDocs(app)

    expect(app.get).toHaveBeenCalledWith('/docs.json', expect.any(Function))
    expect(app.get).toHaveBeenCalledWith('/api-docs.json', expect.any(Function))
    expect(app.get).toHaveBeenCalledWith('/docs/json', expect.any(Function))
    expect(app.use).toHaveBeenCalledWith(
      ['/docs', '/api-docs'],
      expect.any(Function),
    )
    expect(app.use).toHaveBeenCalledWith('/docs', mockServe, expect.any(String))
    expect(app.use).toHaveBeenCalledWith(
      '/api-docs',
      mockServe,
      expect.any(String),
    )
  })

  it('the CSP middleware sets the header and calls next', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ openapi: '3.0.0' }))
    const { setupSwaggerDocs } = loadSwagger({ enableSwaggerDocs: true })
    const app = mockApp()

    setupSwaggerDocs(app)

    const cspMiddleware = app.use.mock.calls.find(
      (call: any[]) => call[0][0] === '/docs' && call[1],
    )[1]
    const res = { setHeader: jest.fn() }
    const next = jest.fn()

    cspMiddleware({}, res, next)

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining("default-src 'self'"),
    )
    expect(next).toHaveBeenCalled()
  })

  it('the JSON spec handler sends the spec with a 200 status', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ openapi: '3.0.0' }))
    const { setupSwaggerDocs } = loadSwagger({ enableSwaggerDocs: true })
    const app = mockApp()

    setupSwaggerDocs(app)

    const sendSpecHandler = app.get.mock.calls.find(
      (call: any[]) => call[0] === '/docs.json',
    )[1]
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    }

    sendSpecHandler({}, res)

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/json',
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ openapi: '3.0.0' }),
    )
  })
})
