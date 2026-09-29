jest.mock('../service', () => ({ getDashboard: jest.fn() }))

import { getDashboard } from '../service'
import { getDashboardData } from '../controller'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}
const mockReq = (overrides: Record<string, any> = {}) => ({
  user: { userId: 'user-1' },
  ...overrides,
})
const next = jest.fn()

beforeEach(() => jest.clearAllMocks())

describe('getDashboardData', () => {
  it("returns the caller's dashboard", async () => {
    ;(getDashboard as jest.Mock).mockResolvedValue({ briefing: {} })
    const res = mockRes()
    await getDashboardData(mockReq() as any, res, next)
    expect(getDashboard).toHaveBeenCalledWith('user-1')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { briefing: {} } }),
    )
  })

  it('forwards an unauthenticated request to next()', async () => {
    const req = mockReq({ user: undefined })
    const res = mockRes()
    await getDashboardData(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })

  it('forwards a downstream failure to next()', async () => {
    ;(getDashboard as jest.Mock).mockRejectedValue(new Error('db down'))
    const res = mockRes()
    await getDashboardData(mockReq() as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
