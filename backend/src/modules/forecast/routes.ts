import { Router } from 'express'
import { priorityQueue } from '../../shared/middlewares/priority-queue'
import { MeteredFeature } from '../payments/public'
import {
  attachTeamContext,
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
  attachTeamContext,
  gate(
    Resource.CORE_APP,
    Action.READ,
    requirePlanOrQuota('forecast', 1, MeteredFeature.AI_FORECAST),
  ),
  priorityQueue(),
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
