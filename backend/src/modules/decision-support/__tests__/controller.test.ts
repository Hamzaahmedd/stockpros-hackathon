jest.mock('../service', () => ({
  calculatePositionSize: jest.fn(),
  getLatestPortfolioForUser: jest.fn(),
  getMarketDecisionResponse: jest.fn(),
  getOpportunityRadar: jest.fn(),
  getPortfolioDecisionResponse: jest.fn(),
  getPortfolioRiskMetrics: jest.fn(),
  removePortfoliosForUser: jest.fn(),
  uploadPortfolio: jest.fn(),
}))

jest.mock('../pdf-generator', () => ({
  generatePortfolioReportPdfBuffer: jest.fn(),
  generateTradePlanPdfBuffer: jest.fn(),
}))

import {
  calculatePositionSize,
  getLatestPortfolioForUser,
  getMarketDecisionResponse,
  getOpportunityRadar,
  getPortfolioDecisionResponse,
  getPortfolioRiskMetrics,
  removePortfoliosForUser,
  uploadPortfolio,
} from '../service'
import {
  generatePortfolioReportPdfBuffer,
  generateTradePlanPdfBuffer,
} from '../pdf-generator'
import * as controller from '../controller'

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
  params: {},
  query: {},
  body: {},
  ...overrides,
})

const next = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getMarketBasedTradeDecision', () => {
  it('returns the trade decision for a valid symbol', async () => {
    ;(getMarketDecisionResponse as jest.Mock).mockResolvedValue({
      symbol: 'AAPL',
    })
    const req = mockReq({ params: { symbol: 'AAPL' } })
    const res = mockRes()

    await controller.getMarketBasedTradeDecision(req as any, res, next)

    expect(getMarketDecisionResponse).toHaveBeenCalledWith('AAPL')
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { symbol: 'AAPL' } }),
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('forwards a validation failure to next() instead of throwing', async () => {
    const req = mockReq({ params: {} }) // missing required symbol
    const res = mockRes()

    await controller.getMarketBasedTradeDecision(req as any, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(getMarketDecisionResponse).not.toHaveBeenCalled()
  })

  it('forwards a downstream service failure to next()', async () => {
    ;(getMarketDecisionResponse as jest.Mock).mockRejectedValue(
      new Error('finnhub down'),
    )
    const req = mockReq({ params: { symbol: 'AAPL' } })
    const res = mockRes()

    await controller.getMarketBasedTradeDecision(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getOpportunityRadarHandler', () => {
  it('defaults the timeline to 1D when not provided', async () => {
    ;(getOpportunityRadar as jest.Mock).mockResolvedValue([])
    const req = mockReq()
    const res = mockRes()

    await controller.getOpportunityRadarHandler(req as any, res, next)
    expect(getOpportunityRadar).toHaveBeenCalledWith('1D')
  })

  it('passes through an explicit timeline', async () => {
    ;(getOpportunityRadar as jest.Mock).mockResolvedValue([])
    const req = mockReq({ query: { timeline: '1W' } })
    const res = mockRes()

    await controller.getOpportunityRadarHandler(req as any, res, next)
    expect(getOpportunityRadar).toHaveBeenCalledWith('1W')
  })

  it('forwards a downstream service failure to next()', async () => {
    ;(getOpportunityRadar as jest.Mock).mockRejectedValue(new Error('fmp down'))
    const req = mockReq()
    const res = mockRes()
    await controller.getOpportunityRadarHandler(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('calculatePositionSizeHandler', () => {
  it('combines market data and the sizing calculation into one response', async () => {
    ;(getMarketDecisionResponse as jest.Mock).mockResolvedValue({
      priceState: { current: 100 },
      priceTargets: { stopLoss: 90, bullTarget: 120 },
      atr: 2,
      decision: { recommendation: 'BUY', confidence: 0.8 },
    })
    ;(calculatePositionSize as jest.Mock).mockReturnValue({
      shares: 10,
      totalRisk: 100,
    })

    const req = mockReq({ body: { capital: 1000, symbol: 'AAPL' } })
    const res = mockRes()

    await controller.calculatePositionSizeHandler(req as any, res, next)

    expect(calculatePositionSize).toHaveBeenCalledWith({
      capital: 1000,
      currentPrice: 100,
      stopLoss: 90,
      bullTarget: 120,
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          symbol: 'AAPL',
          shares: 10,
          recommendation: 'BUY',
        }),
      }),
    )
  })

  it('rejects capital above the validator ceiling', async () => {
    const req = mockReq({ body: { capital: 50_000_000, symbol: 'AAPL' } })
    const res = mockRes()
    await controller.calculatePositionSizeHandler(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getPortfolioRiskMetricsHandler', () => {
  it('returns computed risk metrics for a portfolio id', async () => {
    ;(getPortfolioRiskMetrics as jest.Mock).mockResolvedValue({
      weightedBeta: 1.1,
    })
    const req = mockReq({ body: { portfolioId: 'p-1' } })
    const res = mockRes()

    await controller.getPortfolioRiskMetricsHandler(req as any, res, next)
    expect(getPortfolioRiskMetrics).toHaveBeenCalledWith('p-1')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { weightedBeta: 1.1 } }),
    )
  })

  it('forwards a downstream service failure to next()', async () => {
    ;(getPortfolioRiskMetrics as jest.Mock).mockRejectedValue(
      new Error('db down'),
    )
    const req = mockReq({ body: { portfolioId: 'p-1' } })
    const res = mockRes()
    await controller.getPortfolioRiskMetricsHandler(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getLatestPortfolio', () => {
  it("returns the caller's own latest portfolio", async () => {
    ;(getLatestPortfolioForUser as jest.Mock).mockResolvedValue({
      portfolioId: 'p-1',
    })
    const req = mockReq()
    const res = mockRes()

    await controller.getLatestPortfolio(req as any, res, next)
    expect(getLatestPortfolioForUser).toHaveBeenCalledWith('user-1')
  })

  it('forwards an unauthenticated request to next()', async () => {
    const req = mockReq({ user: undefined })
    const res = mockRes()
    await controller.getLatestPortfolio(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('removePortfolios', () => {
  it('removes the portfolio and reports the count removed', async () => {
    ;(removePortfoliosForUser as jest.Mock).mockResolvedValue(2)
    const req = mockReq()
    const res = mockRes()

    await controller.removePortfolios(req as any, res, next)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { removedCount: 2 } }),
    )
  })

  it('forwards a downstream service failure to next()', async () => {
    ;(removePortfoliosForUser as jest.Mock).mockRejectedValue(
      new Error('db down'),
    )
    const req = mockReq()
    const res = mockRes()
    await controller.removePortfolios(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('uploadTraderPortfolio', () => {
  it('passes the uploaded file through to the service', async () => {
    ;(uploadPortfolio as jest.Mock).mockResolvedValue({
      portfolioId: 'p-1',
      positions: [],
    })
    const req = mockReq({
      file: { mimetype: 'text/csv', buffer: Buffer.from('data') },
    })
    const res = mockRes()

    await controller.uploadTraderPortfolio(req as any, res, next)
    expect(uploadPortfolio).toHaveBeenCalledWith(
      'text/csv',
      Buffer.from('data'),
      'user-1',
    )
  })

  it('handles a missing file gracefully (fileSize logs as 0)', async () => {
    ;(uploadPortfolio as jest.Mock).mockResolvedValue({
      portfolioId: 'p-1',
      positions: [],
    })
    const req = mockReq() // no req.file at all
    const res = mockRes()

    await controller.uploadTraderPortfolio(req as any, res, next)
    expect(uploadPortfolio).toHaveBeenCalledWith(undefined, undefined, 'user-1')
  })

  it('forwards a rejected upload (e.g. validation failure) to next()', async () => {
    ;(uploadPortfolio as jest.Mock).mockRejectedValue(new Error('bad file'))
    const req = mockReq({
      file: { mimetype: 'text/csv', buffer: Buffer.from('x') },
    })
    const res = mockRes()

    await controller.uploadTraderPortfolio(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('getPortfolioBasedTradeDecision', () => {
  it("generates decisions for the caller's portfolio in the requested mode", async () => {
    ;(getPortfolioDecisionResponse as jest.Mock).mockResolvedValue({
      positions: [],
    })
    const req = mockReq({
      body: { portfolioId: 'p-1', decisionMode: 'OVERVIEW' },
    })
    const res = mockRes()

    await controller.getPortfolioBasedTradeDecision(req as any, res, next)
    expect(getPortfolioDecisionResponse).toHaveBeenCalledWith(
      'user-1',
      'p-1',
      'OVERVIEW',
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'OVERVIEW decisions generated successfully.',
      }),
    )
  })

  it('rejects an invalid decision mode', async () => {
    const req = mockReq({ body: { portfolioId: 'p-1', decisionMode: 'BOGUS' } })
    const res = mockRes()
    await controller.getPortfolioBasedTradeDecision(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('exportTradePlanPdf', () => {
  it('streams the generated PDF with the correct headers', async () => {
    ;(generateTradePlanPdfBuffer as jest.Mock).mockResolvedValue(
      Buffer.from('pdf-bytes'),
    )
    const req = mockReq({ body: { symbol: 'aapl' } })
    const res = mockRes()

    await controller.exportTradePlanPdf(req as any, res, next)

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    )
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('stockpros_trade_plan_AAPL_'),
    )
    expect(res.end).toHaveBeenCalledWith(Buffer.from('pdf-bytes'))
  })

  it('forwards a missing-symbol request to next() without generating a PDF', async () => {
    const req = mockReq({ body: {} })
    const res = mockRes()

    await controller.exportTradePlanPdf(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(generateTradePlanPdfBuffer).not.toHaveBeenCalled()
  })
})

describe('exportPortfolioPdf', () => {
  it('streams the generated portfolio report PDF with the correct headers', async () => {
    ;(generatePortfolioReportPdfBuffer as jest.Mock).mockResolvedValue(
      Buffer.from('pdf-bytes'),
    )
    const req = mockReq({
      body: {
        portfolioData: { summary: {} },
        detailedPositions: [{ symbol: 'AAPL' }],
      },
    })
    const res = mockRes()

    await controller.exportPortfolioPdf(req as any, res, next)

    expect(generatePortfolioReportPdfBuffer).toHaveBeenCalledWith({
      portfolioData: { summary: {} },
      detailedPositions: [{ symbol: 'AAPL' }],
      riskMetrics: undefined,
    })
    expect(res.end).toHaveBeenCalledWith(Buffer.from('pdf-bytes'))
  })

  it('forwards a missing-portfolioData request to next() without generating a PDF', async () => {
    const req = mockReq({ body: {} })
    const res = mockRes()

    await controller.exportPortfolioPdf(req as any, res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(generatePortfolioReportPdfBuffer).not.toHaveBeenCalled()
  })

  it('handles a missing detailedPositions list gracefully (position count logs as 0)', async () => {
    ;(generatePortfolioReportPdfBuffer as jest.Mock).mockResolvedValue(
      Buffer.from('pdf'),
    )
    const req = mockReq({ body: { portfolioData: { summary: {} } } })
    const res = mockRes()

    await controller.exportPortfolioPdf(req as any, res, next)
    expect(res.end).toHaveBeenCalledWith(Buffer.from('pdf'))
  })
})
