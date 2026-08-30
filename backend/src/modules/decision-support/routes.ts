import { Router } from 'express'
import * as DecisionController from './controller'
import { authTokenMiddleware as authenticate } from '../auth'
import { Action, rbacMiddleware, Resource } from '../access-control'
import { upload } from '../../shared/middlewares'

const router = Router()

router.use(authenticate)

// ─── Market Intelligence ─────────────────────────────────────────────────────
router.get(
  '/market/decision/:symbol',
  DecisionController.getMarketBasedTradeDecision,
)

router.get(
  '/market/radar',
  DecisionController.getOpportunityRadarHandler,
)

router.post(
  '/market/position-size',
  DecisionController.calculatePositionSizeHandler,
)

// ─── Portfolio Analysis ──────────────────────────────────────────────────────
router.post(
  '/upload-portfolio',
  rbacMiddleware(Resource.PORTFOLIO, Action.CREATE),
  upload.single('portfolio'),
  DecisionController.uploadTraderPortfolio,
)

router.post(
  '/portfolio/decision',
  rbacMiddleware(Resource.PORTFOLIO, Action.CREATE),
  DecisionController.getPortfolioBasedTradeDecision,
)

router.post(
  '/portfolio/risk-metrics',
  rbacMiddleware(Resource.PORTFOLIO, Action.READ),
  DecisionController.getPortfolioRiskMetricsHandler,
)

router.get(
  '/portfolio/latest',
  rbacMiddleware(Resource.PORTFOLIO, Action.READ),
  DecisionController.getLatestPortfolio,
)

export default router
