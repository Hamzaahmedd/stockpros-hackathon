import { Router } from 'express'
import { authTokenMiddleware } from '../auth'
import { Action, rbacMiddleware, Resource } from '../access-control'
import { getTopStocks } from './controller'

const router = Router()

router.get(
  '/top-stocks',
  authTokenMiddleware,
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  getTopStocks,
)

export default router
