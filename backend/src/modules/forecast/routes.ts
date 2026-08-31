import { Router } from 'express'
import { exportForecastPdf, getStockForecast } from './controller'
import { authTokenMiddleware } from '../auth'

const router = Router()

router.get('/', authTokenMiddleware, getStockForecast)
router.post('/pdf', authTokenMiddleware, exportForecastPdf)
router.get('/pdf', authTokenMiddleware, exportForecastPdf)

export default router
