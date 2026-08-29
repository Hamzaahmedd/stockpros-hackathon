import { Router } from 'express'
import { getStockForecast } from './controller'
import { authTokenMiddleware } from '../auth'

const router = Router()

/**
 * @swagger
 * tags:
 *   - name: Forecast
 *     description: AI-powered stock price forecasting
 */

/**
 * @swagger
 * /api/v1/forecast:
 *   get:
 *     summary: Get AI forecast for a stock
 *     tags: [Forecast]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *         description: Ticker symbol (e.g. AAPL, TSLA)
 *         example: AAPL
 *       - in: query
 *         name: period
 *         required: false
 *         schema:
 *           type: string
 *           enum: [1d, 1w]
 *           default: 1w
 *         description: Forecast horizon
 *     responses:
 *       200:
 *         description: Forecast data including historical prices and predictions
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         symbol:
 *                           type: string
 *                         period:
 *                           type: string
 *                         currentPrice:
 *                           type: number
 *                         historicalData:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               date:
 *                                 type: string
 *                               price:
 *                                 type: number
 *                         predictions:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               date:
 *                                 type: string
 *                               price:
 *                                 type: number
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorEnvelope'
 */
router.get('/', authTokenMiddleware, getStockForecast)

export default router
