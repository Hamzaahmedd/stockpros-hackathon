jest.mock('../service', () => ({ searchSymbols: jest.fn() }))

import { searchSymbols } from '../service'
import { symbolLookup } from '../controller'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}
const mockReq = (overrides: Record<string, any> = {}) => ({
  query: {},
  ...overrides,
})
const next = jest.fn()

beforeEach(() => jest.clearAllMocks())

describe('symbolLookup', () => {
  it('looks up symbols, defaulting exchange to US', async () => {
    ;(searchSymbols as jest.Mock).mockResolvedValue([{ symbol: 'AAPL' }])
    const req = mockReq({ query: { q: 'apple' } })
    const res = mockRes()
    await symbolLookup(req as any, res, next)
    expect(searchSymbols).toHaveBeenCalledWith('apple', 'US')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ symbol: 'AAPL' }] }),
    )
  })

  it('passes through an explicit exchange', async () => {
    ;(searchSymbols as jest.Mock).mockResolvedValue([])
    const req = mockReq({ query: { q: 'apple', exchange: 'LSE' } })
    const res = mockRes()
    await symbolLookup(req as any, res, next)
    expect(searchSymbols).toHaveBeenCalledWith('apple', 'LSE')
  })

  it('rejects a missing query', async () => {
    const req = mockReq({ query: {} })
    const res = mockRes()
    await symbolLookup(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
