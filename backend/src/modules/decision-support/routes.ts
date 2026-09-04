import { Router } from 'express'
import { upload } from '../../shared/middlewares'
import { Action, rbacMiddleware, Resource } from '../access-control'
import { authTokenMiddleware as authenticate } from '../auth'
import * as DecisionController from './controller'

const router = Router()

router.use(authenticate)

// ─── Market Intelligence ─────────────────────────────────────────────────────
router.get(
  '/market/decision/:symbol',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  DecisionController.getMarketBasedTradeDecision,
)

router.get(
  '/market/radar',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  DecisionController.getOpportunityRadarHandler,
)

router.post(
  '/market/position-size',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  DecisionController.calculatePositionSizeHandler,
)

// ─── Portfolio Analysis ──────────────────────────────────────────────────────
router.post(
  '/upload-portfolio',
  rbacMiddleware(Resource.PORTFOLIO, Action.WRITE),
  upload.single('portfolio'),
  DecisionController.uploadTraderPortfolio,
)

router.post(
  '/portfolio/decision',
  rbacMiddleware(Resource.PORTFOLIO, Action.WRITE),
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

router.delete(
  '/portfolio',
  rbacMiddleware(Resource.PORTFOLIO, Action.WRITE),
  DecisionController.removePortfolios,
)

// ─── PDF Exports ─────────────────────────────────────────────────────────────
router.post(
  '/trade-plan/pdf',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  DecisionController.exportTradePlanPdf,
)

router.post(
  '/portfolio/pdf',
  rbacMiddleware(Resource.PORTFOLIO, Action.READ),
  DecisionController.exportPortfolioPdf,
)

export default router
