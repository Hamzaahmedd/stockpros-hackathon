jest.mock('../../../../shared/infrastructure/cache', () => ({
  getCache: jest.fn(),
  setCache: jest.fn(),
}))

jest.mock('../../../../shared/infrastructure/clients/finnhub-client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../../../../shared/infrastructure/logger', () => ({
  logger: { error: jest.fn() },
}))

import { getCache, setCache } from '../../../../shared/infrastructure/cache'
import finnhubClient from '../../../../shared/infrastructure/clients/finnhub-client'
import { getCompanyLogo } from '../logo-cache'

const mockGetCache = getCache as jest.Mock
const mockSetCache = setCache as jest.Mock
const mockGet = (finnhubClient as unknown as { get: jest.Mock }).get

beforeEach(() => jest.clearAllMocks())

describe('getCompanyLogo', () => {
  it('returns a cached logo URL without calling Finnhub', async () => {
    mockGetCache.mockResolvedValue('https://logo.example/aapl.png')
    const result = await getCompanyLogo('AAPL')
    expect(result).toBe('https://logo.example/aapl.png')
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('returns a cached null (a known-absent logo) without refetching', async () => {
    mockGetCache.mockResolvedValue(null)

    const result = await getCompanyLogo('ZZZ')

    expect(mockGet).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('fetches from Finnhub and caches the result on a cache miss', async () => {
    mockGetCache.mockResolvedValue(undefined)
    mockGet.mockResolvedValue({
      data: { logo: 'https://logo.example/msft.png' },
    })

    const result = await getCompanyLogo('MSFT')

    expect(result).toBe('https://logo.example/msft.png')
    expect(mockSetCache).toHaveBeenCalledWith(
      'market:logo:MSFT',
      'https://logo.example/msft.png',
      expect.any(Number),
    )
  })

  it('caches null when Finnhub returns no logo field', async () => {
    mockGetCache.mockResolvedValue(undefined)
    mockGet.mockResolvedValue({ data: {} })

    const result = await getCompanyLogo('ZZZ')

    expect(result).toBeNull()
    expect(mockSetCache).toHaveBeenCalledWith(
      'market:logo:ZZZ',
      null,
      expect.any(Number),
    )
  })

  it('returns null and swallows the error when the Finnhub call fails', async () => {
    mockGetCache.mockResolvedValue(undefined)
    mockGet.mockRejectedValue(new Error('finnhub down'))

    const result = await getCompanyLogo('AAPL')

    expect(result).toBeNull()
    expect(mockSetCache).not.toHaveBeenCalled()
  })
})
