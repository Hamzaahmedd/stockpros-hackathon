import { Router } from 'express'
import { upload } from '../../shared/middlewares'
import {
  gate,
  noTierRestriction,
  requirePlan,
  requireSinglePortfolioForFree,
  requireWatchlistMembershipOrPro,
} from '../../shared/middlewares/plan-gating'
import { Action, Resource } from '../access-control'
import { authTokenMiddleware as authenticate } from '../auth'
import * as DecisionController from './controller'

const router = Router()

router.use(authenticate)

// ─── Market Intelligence ─────────────────────────────────────────────────────
router.get(
  '/market/decision/:symbol',
  gate(Resource.CORE_APP, Action.READ, requireWatchlistMembershipOrPro),
  DecisionController.getMarketBasedTradeDecision,
)

router.get(
  '/market/radar',
  gate(Resource.CORE_APP, Action.READ, requireWatchlistMembershipOrPro),
  DecisionController.getOpportunityRadarHandler,
)

router.post(
  '/market/position-size',
  gate(Resource.CORE_APP, Action.WRITE, requireWatchlistMembershipOrPro),
  DecisionController.calculatePositionSizeHandler,
)

// ─── Portfolio Analysis ──────────────────────────────────────────────────────
router.post(
  '/upload-portfolio',
  gate(Resource.PORTFOLIO, Action.WRITE, requireSinglePortfolioForFree),
  upload.single('portfolio'),
  DecisionController.uploadTraderPortfolio,
)

router.post(
  '/portfolio/decision',
  gate(Resource.PORTFOLIO, Action.WRITE, noTierRestriction),
  DecisionController.getPortfolioBasedTradeDecision,
)

router.post(
  '/portfolio/risk-metrics',
  gate(Resource.PORTFOLIO, Action.READ, requirePlan('PRO')),
  DecisionController.getPortfolioRiskMetricsHandler,
)

router.get(
  '/portfolio/latest',
  gate(Resource.PORTFOLIO, Action.READ, noTierRestriction),
  DecisionController.getLatestPortfolio,
)

router.delete(
  '/portfolio',
  gate(Resource.PORTFOLIO, Action.WRITE, noTierRestriction),
  DecisionController.removePortfolios,
)

// ─── PDF Exports ─────────────────────────────────────────────────────────────
router.post(
  '/trade-plan/pdf',
  gate(Resource.CORE_APP, Action.READ, requirePlan('PRO')),
  DecisionController.exportTradePlanPdf,
)

router.post(
  '/portfolio/pdf',
  gate(Resource.PORTFOLIO, Action.READ, requirePlan('PRO')),
  DecisionController.exportPortfolioPdf,
)

export default router
