import { Router } from 'express'
import * as WatchlistController from './controller'
import { authTokenMiddleware as authenticate } from '../auth'
import { Action, rbacMiddleware, Resource } from '../access-control'

const router = Router()

router.use(authenticate)

// ─── Watchlist CRUD ──────────────────────────────────────────────────────────
router.post(
  '/',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  WatchlistController.addToWatchlist,
)
router.get(
  '/',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  WatchlistController.getWatchlist,
)
router.patch(
  '/:symbol',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  WatchlistController.updateWatchlistEntry,
)
router.delete(
  '/:symbol',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  WatchlistController.removeFromWatchlist,
)

// ─── Convert to Position ─────────────────────────────────────────────────────
router.post(
  '/:symbol/convert-to-position',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  WatchlistController.convertToPosition,
)

// ─── Alert Management ─────────────────────────────────────────────────────────
router.post(
  '/:symbol/alerts',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  WatchlistController.createAlert,
)
router.get(
  '/:symbol/alerts',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  WatchlistController.getAlerts,
)
router.patch(
  '/:symbol/alerts/:id',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  WatchlistController.updateAlert,
)
router.delete(
  '/:symbol/alerts/:id',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  WatchlistController.deleteAlert,
)

export default router
