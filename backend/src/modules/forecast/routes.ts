import { Router } from 'express'
import { Action, rbacMiddleware, Resource } from '../access-control'
import { authTokenMiddleware } from '../auth'
import { exportForecastPdf, getStockForecast } from './controller'

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
