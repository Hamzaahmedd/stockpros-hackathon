const mockAxiosGet = jest.fn<Promise<any>, any[]>()
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: mockAxiosGet },
}))

const mockExistsSync = jest.fn<boolean, any[]>()
const mockReadFileSync = jest.fn<Buffer, any[]>()
jest.mock('node:fs', () => ({
  __esModule: true,
  default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}))

const mockLogger = { warn: jest.fn() }
jest.mock('../../infrastructure/logger', () => ({ logger: mockLogger }))

const loadPdfLogo = (logoUrl: string) => {
  jest.resetModules()
  jest.doMock('@/config', () => {
    const actual = jest.requireActual('@/config')
    const patched = {
      ...actual.default,
      brand: { ...actual.default.brand, logoUrl },
    }
    return { __esModule: true, default: patched, config: patched }
  })
  return jest.requireActual('../pdf-logo') as typeof import('../pdf-logo')
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getStockProsLogoDataUri', () => {
  it('fetches from the remote logo URL and returns a data URI, caching across calls', async () => {
    mockAxiosGet.mockResolvedValue({ data: Buffer.from('remote-bytes') })
    const { getStockProsLogoDataUri } = loadPdfLogo(
      'https://cdn.example/logo.png',
    )

    const first = await getStockProsLogoDataUri()
    const second = await getStockProsLogoDataUri()

    expect(first).toMatch(/^data:image\/png;base64,/)
    expect(second).toBe(first)
    expect(mockAxiosGet).toHaveBeenCalledTimes(1)
  })

  it('falls back to the local asset when the remote fetch fails', async () => {
    mockAxiosGet.mockRejectedValue(new Error('timeout'))
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(Buffer.from('local-bytes'))
    const { getStockProsLogoDataUri } = loadPdfLogo(
      'https://cdn.example/logo.png',
    )

    const result = await getStockProsLogoDataUri()

    expect(result).toBe(
      `data:image/png;base64,${Buffer.from('local-bytes').toString('base64')}`,
    )
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to fetch StockPros logo for PDF from remote URL',
      ),
    )
  })

  it('formats a non-Error rejection reason via String() rather than .message', async () => {
    mockAxiosGet.mockRejectedValue('raw string failure')
    mockExistsSync.mockReturnValue(false)
    const { getStockProsLogoDataUri } = loadPdfLogo(
      'https://cdn.example/logo.png',
    )

    await getStockProsLogoDataUri()

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'falling back to local asset: raw string failure',
      ),
    )
  })

  it('goes straight to the local asset when no remote logo URL is configured', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(Buffer.from('local-bytes'))
    const { getStockProsLogoDataUri } = loadPdfLogo('')

    const result = await getStockProsLogoDataUri()

    expect(mockAxiosGet).not.toHaveBeenCalled()
    expect(result).toContain('data:image/png;base64,')
  })

  it('returns null when neither the remote fetch nor the local file is available', async () => {
    mockExistsSync.mockReturnValue(false)
    const { getStockProsLogoDataUri } = loadPdfLogo('')

    expect(await getStockProsLogoDataUri()).toBeNull()
  })

  it('returns null and does not throw when the local file read itself errors', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation(() => {
      throw new Error('fs error')
    })
    const { getStockProsLogoDataUri } = loadPdfLogo('')

    expect(await getStockProsLogoDataUri()).toBeNull()
  })
})

// Makes this file a module so its top-level helpers do not collide with other
// import-less test files in the shared ts-jest program (TS2451).
export {}
