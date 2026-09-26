import { Router } from 'express'
import {
  gate,
  requirePlan,
  requirePlanOrQuota,
} from '../../shared/middlewares/plan-gating'
import { Action, Resource } from '../access-control'
import { authTokenMiddleware } from '../auth'
import { exportForecastPdf, getStockForecast } from './controller'

const router = Router()

router.get(
  '/',
  authTokenMiddleware,
  gate(Resource.CORE_APP, Action.READ, requirePlanOrQuota('forecast', 1)),
  getStockForecast,
)
router.post(
  '/pdf',
  authTokenMiddleware,
  gate(Resource.CORE_APP, Action.READ, requirePlan('PRO')),
  exportForecastPdf,
)
router.get(
  '/pdf',
  authTokenMiddleware,
  gate(Resource.CORE_APP, Action.READ, requirePlan('PRO')),
  exportForecastPdf,
)

export default router
