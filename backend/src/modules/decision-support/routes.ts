import { Router } from 'express'
import { upload } from '../../shared/middlewares'
import { priorityQueue } from '../../shared/middlewares/priority-queue'
import { MeteredFeature } from '../payments/public'
import {
  attachTeamContext,
  composeHandlers,
  gate,
  meterPaidAiSignal,
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

// Watchlist-membership rule for FREE, then the PRO/TEAM monthly quota + credits.
const meteredDecisionAccess = composeHandlers(
  requireWatchlistMembershipOrPro,
  meterPaidAiSignal(MeteredFeature.AI_DECISION),
)

// ─── Market Intelligence ─────────────────────────────────────────────────────
router.get(
  '/market/decision/:symbol',
  attachTeamContext,
  gate(Resource.CORE_APP, Action.READ, meteredDecisionAccess),
  priorityQueue(),
  DecisionController.getMarketBasedTradeDecision,
)

router.get(
  '/market/radar',
  attachTeamContext,
  gate(Resource.CORE_APP, Action.READ, meteredDecisionAccess),
  priorityQueue(),
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
