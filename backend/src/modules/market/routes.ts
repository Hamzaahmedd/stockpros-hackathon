import { Router } from 'express'
import { Action, rbacMiddleware, Resource } from '../access-control'
import { getTopStocks } from './controller'
import { authTokenMiddleware as authenticate } from '../auth'

const router = Router()

router.use(authenticate)

router.get(
  '/top-stocks',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  getTopStocks,
)

export default router
