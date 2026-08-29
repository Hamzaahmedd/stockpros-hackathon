import { Router } from 'express'
import { authTokenMiddleware } from '../auth'
import { getTopStocks } from './controller'

const router = Router()

/**
 * @swagger
 * tags:
 *   - name: Market
 *     description: Live and ranked market data
 */

/**
 * @swagger
 * /api/v1/market/top-stocks:
 *   get:
 *     summary: Get top-ranked US stocks
 *     tags: [Market]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Ranked list of top US stocks with live prices and metrics
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           symbol:
 *                             type: string
 *                           name:
 *                             type: string
 *                           price:
 *                             type: number
 *                           change:
 *                             type: number
 *                           sector:
 *                             type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorEnvelope'
 */
router.get('/top-stocks', authTokenMiddleware, getTopStocks)

export default router
