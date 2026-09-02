import { Router } from 'express'
import { authTokenMiddleware } from '../auth'
import { Action, rbacMiddleware, Resource } from '../access-control'
import * as DashboardController from './controller'

const router = Router()

router.use(authTokenMiddleware)

router.get(
  '/',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  DashboardController.getDashboardData,
)

export default router
