jest.mock('../service', () => ({
  addToWatchlist: jest.fn(),
  convertToPosition: jest.fn(),
  createAlert: jest.fn(),
  getWatchlist: jest.fn(),
  getAlerts: jest.fn(),
  updateWatchlistEntry: jest.fn(),
  updateAlert: jest.fn(),
  removeFromWatchlist: jest.fn(),
  deleteAlert: jest.fn(),
}))

import * as WatchlistService from '../service'
import * as controller from '../controller'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}
const mockReq = (overrides: Record<string, any> = {}) => ({
  user: { userId: 'user-1' },
  body: {},
  params: {},
  ...overrides,
})
const next = jest.fn()
const validId = 'a5b1a111-1111-4111-8111-111111111111'

beforeEach(() => jest.clearAllMocks())

describe('addToWatchlist', () => {
  it('adds the symbol and reports 201', async () => {
    ;(WatchlistService.addToWatchlist as jest.Mock).mockResolvedValue({
      symbol: 'AAPL',
    })
    const req = mockReq({ body: { symbol: 'aapl' } })
    const res = mockRes()
    await controller.addToWatchlist(req as any, res, next)
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'AAPL added to watchlist' }),
    )
  })

  it('rejects a missing symbol', async () => {
    const req = mockReq({ body: {} })
    const res = mockRes()
    await controller.addToWatchlist(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('convertToPosition', () => {
  it('converts the position and reports 201', async () => {
    ;(WatchlistService.convertToPosition as jest.Mock).mockResolvedValue(
      undefined,
    )
    const req = mockReq({ params: { symbol: 'aapl' }, body: { quantity: 5 } })
    const res = mockRes()
    await controller.convertToPosition(req as any, res, next)
    expect(WatchlistService.convertToPosition).toHaveBeenCalledWith(
      'user-1',
      'aapl',
      {
        quantity: 5,
      },
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('rejects a missing symbol param', async () => {
    const req = mockReq({ params: {}, body: {} })
    const res = mockRes()
    await controller.convertToPosition(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('createAlert', () => {
  it('creates the alert and reports 201', async () => {
    ;(WatchlistService.createAlert as jest.Mock).mockResolvedValue({ id: 'a1' })
    const req = mockReq({
      params: { symbol: 'aapl' },
      body: { type: 'PRICE_ABOVE' },
    })
    const res = mockRes()
    await controller.createAlert(req as any, res, next)
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Alert set for AAPL' }),
    )
  })

  it('rejects an invalid alert type', async () => {
    const req = mockReq({
      params: { symbol: 'aapl' },
      body: { type: 'NOT_A_TYPE' },
    })
    const res = mockRes()
    await controller.createAlert(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getWatchlist', () => {
  it('returns the watchlist', async () => {
    ;(WatchlistService.getWatchlist as jest.Mock).mockResolvedValue([
      { symbol: 'AAPL' },
    ])
    const res = mockRes()
    await controller.getWatchlist(mockReq() as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ symbol: 'AAPL' }] }),
    )
  })

  it('forwards a downstream failure to next()', async () => {
    ;(WatchlistService.getWatchlist as jest.Mock).mockRejectedValue(
      new Error('x'),
    )
    const res = mockRes()
    await controller.getWatchlist(mockReq() as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getAlerts', () => {
  it('returns alerts for the symbol', async () => {
    ;(WatchlistService.getAlerts as jest.Mock).mockResolvedValue([{ id: 'a1' }])
    const req = mockReq({ params: { symbol: 'aapl' } })
    const res = mockRes()
    await controller.getAlerts(req as any, res, next)
    expect(WatchlistService.getAlerts).toHaveBeenCalledWith('user-1', 'aapl')
  })

  it('rejects a missing symbol param', async () => {
    const req = mockReq({ params: {} })
    const res = mockRes()
    await controller.getAlerts(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('updateWatchlistEntry', () => {
  it('updates the entry', async () => {
    ;(WatchlistService.updateWatchlistEntry as jest.Mock).mockResolvedValue({
      symbol: 'AAPL',
    })
    const req = mockReq({
      params: { symbol: 'aapl' },
      body: { notes: 'watching' },
    })
    const res = mockRes()
    await controller.updateWatchlistEntry(req as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'AAPL entry updated' }),
    )
  })

  it('rejects an empty update body', async () => {
    const req = mockReq({ params: { symbol: 'aapl' }, body: {} })
    const res = mockRes()
    await controller.updateWatchlistEntry(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('updateAlert', () => {
  it('updates the alert', async () => {
    ;(WatchlistService.updateAlert as jest.Mock).mockResolvedValue({
      id: validId,
    })
    const req = mockReq({
      params: { symbol: 'aapl', id: validId },
      body: { isActive: false },
    })
    const res = mockRes()
    await controller.updateAlert(req as any, res, next)
    expect(WatchlistService.updateAlert).toHaveBeenCalledWith(
      'user-1',
      'aapl',
      validId,
      { isActive: false },
    )
  })

  it('rejects an invalid alert id', async () => {
    const req = mockReq({
      params: { symbol: 'aapl', id: 'not-a-uuid' },
      body: { isActive: false },
    })
    const res = mockRes()
    await controller.updateAlert(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('removeFromWatchlist', () => {
  it('removes the symbol', async () => {
    ;(WatchlistService.removeFromWatchlist as jest.Mock).mockResolvedValue(
      undefined,
    )
    const req = mockReq({ params: { symbol: 'aapl' } })
    const res = mockRes()
    await controller.removeFromWatchlist(req as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'AAPL removed from watchlist' }),
    )
  })

  it('forwards a downstream failure to next()', async () => {
    ;(WatchlistService.removeFromWatchlist as jest.Mock).mockRejectedValue(
      new Error('x'),
    )
    const req = mockReq({ params: { symbol: 'aapl' } })
    const res = mockRes()
    await controller.removeFromWatchlist(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('deleteAlert', () => {
  it('deletes the alert', async () => {
    ;(WatchlistService.deleteAlert as jest.Mock).mockResolvedValue(undefined)
    const req = mockReq({ params: { symbol: 'aapl', id: validId } })
    const res = mockRes()
    await controller.deleteAlert(req as any, res, next)
    expect(WatchlistService.deleteAlert).toHaveBeenCalledWith(
      'user-1',
      'aapl',
      validId,
    )
  })

  it('rejects a missing id', async () => {
    const req = mockReq({ params: { symbol: 'aapl' } })
    const res = mockRes()
    await controller.deleteAlert(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
