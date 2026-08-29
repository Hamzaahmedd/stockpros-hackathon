import { Router } from 'express'
import * as SearchController from './controller'
import { authTokenMiddleware as authenticate } from '../auth'

const router = Router()

router.use(authenticate)

/**
 * @swagger
 * tags:
 *   - name: Search
 *     description: Symbol and company lookup
 */

/**
 * @swagger
 * /api/v1/search/symbol-lookup:
 *   get:
 *     summary: Search for stock symbols and companies
 *     tags: [Search]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query (symbol or company name)
 *         example: Apple
 *       - in: query
 *         name: exchange
 *         required: false
 *         schema:
 *           type: string
 *           default: US
 *         description: Exchange filter
 *     responses:
 *       200:
 *         description: Matching symbols and companies
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
 *                           exchange:
 *                             type: string
 *                           currency:
 *                             type: string
 */
router.get('/symbol-lookup', SearchController.symbolLookup)

export default router
