import { Router } from 'express'
import { authTokenMiddleware } from '../auth'
import { getTopStocks } from './controller'

const router = Router()

router.get('/top-stocks', authTokenMiddleware, getTopStocks)

export default router
