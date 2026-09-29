jest.mock('../service', () => ({ getRankedTopStocks: jest.fn() }))

import { getRankedTopStocks } from '../service'
import { getTopStocks } from '../controller'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}
const next = jest.fn()

beforeEach(() => jest.clearAllMocks())

describe('getTopStocks', () => {
  it('returns the ranked top stocks', async () => {
    ;(getRankedTopStocks as jest.Mock).mockResolvedValue([{ symbol: 'AAPL' }])
    const res = mockRes()
    await getTopStocks({} as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ symbol: 'AAPL' }] }),
    )
  })

  it('forwards a downstream failure to next()', async () => {
    ;(getRankedTopStocks as jest.Mock).mockRejectedValue(new Error('fmp down'))
    const res = mockRes()
    await getTopStocks({} as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
