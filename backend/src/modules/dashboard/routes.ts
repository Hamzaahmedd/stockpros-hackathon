import { Router } from 'express'
import { authTokenMiddleware } from '../auth'
import * as DashboardController from './controller'

const router = Router()

router.use(authTokenMiddleware)

router.get('/', DashboardController.getDashboardData)

export default router
