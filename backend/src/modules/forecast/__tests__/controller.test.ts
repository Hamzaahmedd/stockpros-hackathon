jest.mock('../service', () => ({ getForecast: jest.fn() }))
jest.mock('../pdf-generator', () => ({
  generateForecastPdfBuffer: jest.fn(),
  getForecastReportFileName: jest.fn(),
}))

import { getForecast } from '../service'
import {
  generateForecastPdfBuffer,
  getForecastReportFileName,
} from '../pdf-generator'
import { exportForecastPdf, getStockForecast } from '../controller'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  res.end = jest.fn().mockReturnValue(res)
  return res
}
const mockReq = (overrides: Record<string, any> = {}) => ({
  user: { userId: 'user-1' },
  query: {},
  body: {},
  ...overrides,
})
const next = jest.fn()

beforeEach(() => jest.clearAllMocks())

describe('getStockForecast', () => {
  it('returns forecast data for a valid symbol/period', async () => {
    ;(getForecast as jest.Mock).mockResolvedValue({ symbol: 'AAPL' })
    const req = mockReq({ query: { symbol: 'aapl', period: '1d' } })
    const res = mockRes()
    await getStockForecast(req as any, res, next)
    expect(getForecast).toHaveBeenCalledWith('AAPL', '1d')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { symbol: 'AAPL' } }),
    )
  })

  it('rejects an invalid period', async () => {
    const req = mockReq({ query: { symbol: 'aapl', period: '1y' } })
    const res = mockRes()
    await getStockForecast(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('exportForecastPdf', () => {
  it('generates a PDF from a pre-supplied forecast body', async () => {
    ;(generateForecastPdfBuffer as jest.Mock).mockResolvedValue(
      Buffer.from('pdf'),
    )
    ;(getForecastReportFileName as jest.Mock).mockReturnValue(
      'aapl-forecast.pdf',
    )
    const req = mockReq({ body: { symbol: 'AAPL', predictions: [] } })
    const res = mockRes()
    await exportForecastPdf(req as any, res, next)
    expect(getForecast).not.toHaveBeenCalled()
    expect(res.end).toHaveBeenCalledWith(Buffer.from('pdf'))
  })

  it('fetches forecast data first when the body has no symbol', async () => {
    ;(getForecast as jest.Mock).mockResolvedValue({ symbol: 'AAPL' })
    ;(generateForecastPdfBuffer as jest.Mock).mockResolvedValue(
      Buffer.from('pdf'),
    )
    ;(getForecastReportFileName as jest.Mock).mockReturnValue(
      'aapl-forecast.pdf',
    )
    const req = mockReq({ body: {}, query: { symbol: 'aapl', period: '1w' } })
    const res = mockRes()
    await exportForecastPdf(req as any, res, next)
    expect(getForecast).toHaveBeenCalledWith('AAPL', '1w')
  })

  it('forwards a downstream PDF generation failure to next()', async () => {
    ;(generateForecastPdfBuffer as jest.Mock).mockRejectedValue(
      new Error('pdf failed'),
    )
    const req = mockReq({ body: { symbol: 'AAPL' } })
    const res = mockRes()
    await exportForecastPdf(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
