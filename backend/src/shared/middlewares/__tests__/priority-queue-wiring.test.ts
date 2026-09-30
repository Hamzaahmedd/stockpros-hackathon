/**
 * Guards that the compute-heavy routes really sit behind the priority queue,
 * and in the right position: after quota/credit gating (so rejected requests
 * never hold a compute slot) and immediately before the controller.
 */
const QUEUE_MARKER = jest.fn()
const TEAM_CONTEXT_MARKER = jest.fn()
const GATE_MARKER = jest.fn()

jest.mock('../priority-queue', () => ({
  priorityQueue: jest.fn(() => QUEUE_MARKER),
}))

jest.mock('../plan-gating', () => ({
  attachTeamContext: TEAM_CONTEXT_MARKER,
  gate: jest.fn(() => GATE_MARKER),
  noTierRestriction: jest.fn(),
  requirePlan: jest.fn(),
  requirePlanOrQuota: jest.fn(),
  requireSinglePortfolioForFree: jest.fn(),
  requireWatchlistMembershipOrPro: jest.fn(),
  composeHandlers: jest.fn(() => jest.fn()),
  meterPaidAiSignal: jest.fn(),
}))

jest.mock('../../../modules/auth', () => ({
  authTokenMiddleware: jest.fn(),
}))
jest.mock('../../../modules/access-control', () => ({
  Action: { READ: 'read', WRITE: 'write' },
  Resource: { CORE_APP: 'core_app', PORTFOLIO: 'portfolio' },
}))
jest.mock('../../../modules/payments/public', () => ({
  MeteredFeature: { AI_FORECAST: 'ai_forecast', AI_DECISION: 'ai_decision' },
}))
jest.mock('../upload', () => ({ upload: { single: jest.fn(() => jest.fn()) } }))
jest.mock('../../../modules/forecast/controller', () => ({
  getStockForecast: jest.fn(),
  exportForecastPdf: jest.fn(),
}))
jest.mock('../../../modules/decision-support/controller', () => ({
  getMarketBasedTradeDecision: jest.fn(),
  getOpportunityRadarHandler: jest.fn(),
  calculatePositionSizeHandler: jest.fn(),
  uploadTraderPortfolio: jest.fn(),
  getPortfolioBasedTradeDecision: jest.fn(),
  getPortfolioRiskMetricsHandler: jest.fn(),
  getLatestPortfolio: jest.fn(),
  removePortfolios: jest.fn(),
  exportTradePlanPdf: jest.fn(),
  exportPortfolioPdf: jest.fn(),
}))

import {
  getMarketBasedTradeDecision,
  getOpportunityRadarHandler,
} from '../../../modules/decision-support/controller'
import decisionRouter from '../../../modules/decision-support/routes'
import { getStockForecast } from '../../../modules/forecast/controller'
import forecastRouter from '../../../modules/forecast/routes'

type Layer = {
  route?: {
    path: string
    methods: Record<string, boolean>
    stack: { handle: unknown }[]
  }
}

const handlersFor = (router: unknown, path: string, method = 'get') => {
  const layer = (router as { stack: Layer[] }).stack.find(
    (l) => l.route?.path === path && l.route.methods[method],
  )
  if (!layer?.route) throw new Error(`route ${method} ${path} not found`)
  return layer.route.stack.map((s) => s.handle)
}

describe.each([
  ['GET /forecast', forecastRouter, '/', getStockForecast],
  [
    'GET /market/decision/:symbol',
    decisionRouter,
    '/market/decision/:symbol',
    getMarketBasedTradeDecision,
  ],
  [
    'GET /market/radar',
    decisionRouter,
    '/market/radar',
    getOpportunityRadarHandler,
  ],
])('%s', (_name, router, path, controller) => {
  const handlers = handlersFor(router, path)

  it('attaches the team context so priority is known before queueing', () => {
    expect(handlers).toContain(TEAM_CONTEXT_MARKER)
    expect(handlers.indexOf(TEAM_CONTEXT_MARKER)).toBeLessThan(
      handlers.indexOf(QUEUE_MARKER),
    )
  })

  it('queues after quota/credit gating and right before the controller', () => {
    const queueAt = handlers.indexOf(QUEUE_MARKER)
    expect(queueAt).toBeGreaterThan(handlers.indexOf(GATE_MARKER))
    expect(handlers[queueAt + 1]).toBe(controller)
  })
})
