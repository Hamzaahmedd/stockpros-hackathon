import { Router } from 'express'
import { authTokenMiddleware } from '../auth'
import * as DashboardController from './controller'

const router = Router()

router.use(authTokenMiddleware)

/**
 * @swagger
 * tags:
 *   - name: Dashboard
 *     description: Portfolio summary and market overview
 */

/**
 * @swagger
 * /api/v1/dashboard:
 *   get:
 *     summary: Get dashboard data
 *     tags: [Dashboard]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Portfolio summary, market overview, and activity feeds
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
 *                         portfolioSummary:
 *                           type: object
 *                         marketOverview:
 *                           type: object
 *                         activityFeed:
 *                           type: array
 *                           items:
 *                             type: object
 */
router.get('/', DashboardController.getDashboardData)

export default router
