import { Router } from 'express'
import {
  gate,
  noTierRestriction,
  requireAlertTypeAllowedForPlan,
  requireWatchlistLimitForFree,
} from '../../shared/middlewares/plan-gating'
import { Action, Resource } from '../access-control'
import { authTokenMiddleware as authenticate } from '../auth'
import * as WatchlistController from './controller'

const router = Router()

router.use(authenticate)

// ─── Watchlist CRUD ──────────────────────────────────────────────────────────
router.post(
  '/',
  gate(Resource.CORE_APP, Action.WRITE, requireWatchlistLimitForFree),
  WatchlistController.addToWatchlist,
)
router.get(
  '/',
  gate(Resource.CORE_APP, Action.READ, noTierRestriction),
  WatchlistController.getWatchlist,
)
router.patch(
  '/:symbol',
  gate(Resource.CORE_APP, Action.WRITE, noTierRestriction),
  WatchlistController.updateWatchlistEntry,
)
router.delete(
  '/:symbol',
  gate(Resource.CORE_APP, Action.WRITE, noTierRestriction),
  WatchlistController.removeFromWatchlist,
)

// ─── Convert to Position ─────────────────────────────────────────────────────
router.post(
  '/:symbol/convert-to-position',
  gate(Resource.CORE_APP, Action.WRITE, noTierRestriction),
  WatchlistController.convertToPosition,
)

// ─── Alert Management ─────────────────────────────────────────────────────────
router.post(
  '/:symbol/alerts',
  gate(Resource.CORE_APP, Action.WRITE, requireAlertTypeAllowedForPlan),
  WatchlistController.createAlert,
)
router.get(
  '/:symbol/alerts',
  gate(Resource.CORE_APP, Action.READ, noTierRestriction),
  WatchlistController.getAlerts,
)
router.patch(
  '/:symbol/alerts/:id',
  gate(Resource.CORE_APP, Action.WRITE, requireAlertTypeAllowedForPlan),
  WatchlistController.updateAlert,
)
router.delete(
  '/:symbol/alerts/:id',
  gate(Resource.CORE_APP, Action.WRITE, noTierRestriction),
  WatchlistController.deleteAlert,
)

export default router
