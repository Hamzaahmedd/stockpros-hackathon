import { Router } from 'express'
import { exportForecastPdf, getStockForecast } from './controller'
import { authTokenMiddleware } from '../auth'
import { Action, rbacMiddleware, Resource } from '../access-control'

const router = Router()

router.get(
  '/',
  authTokenMiddleware,
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  getStockForecast,
)
router.post(
  '/pdf',
  authTokenMiddleware,
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  exportForecastPdf,
)
router.get(
  '/pdf',
  authTokenMiddleware,
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  exportForecastPdf,
)

export default router
