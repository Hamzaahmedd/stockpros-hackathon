import { Router } from 'express'
import * as WatchlistController from './controller'
import { authTokenMiddleware as authenticate } from '../auth'

const router = Router()

router.use(authenticate)

/**
 * @swagger
 * tags:
 *   - name: Watchlist
 *     description: Watchlist management, positions, and price alerts
 */

// ─── Watchlist CRUD ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/watchlist:
 *   post:
 *     summary: Add a symbol to the watchlist
 *     tags: [Watchlist]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [symbol]
 *             properties:
 *               symbol:
 *                 type: string
 *                 example: AAPL
 *               entryPrice:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Symbol added to watchlist
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 *   get:
 *     summary: Get the user's watchlist
 *     tags: [Watchlist]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of watchlist items with live prices and AI levels
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
 */
router.post('/', WatchlistController.addToWatchlist)
router.get('/', WatchlistController.getWatchlist)

/**
 * @swagger
 * /api/v1/watchlist/{symbol}:
 *   patch:
 *     summary: Update a watchlist entry
 *     tags: [Watchlist]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entryPrice:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Watchlist entry updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 *   delete:
 *     summary: Remove a symbol from the watchlist
 *     tags: [Watchlist]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Symbol removed from watchlist
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.patch('/:symbol', WatchlistController.updateWatchlistEntry)
router.delete('/:symbol', WatchlistController.removeFromWatchlist)

// ─── Convert to Position ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/watchlist/{symbol}/convert-to-position:
 *   post:
 *     summary: Convert a watchlist item to a portfolio position
 *     tags: [Watchlist]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantity:
 *                 type: number
 *               buyPrice:
 *                 type: number
 *     responses:
 *       201:
 *         description: Symbol converted to portfolio position
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.post(
  '/:symbol/convert-to-position',
  WatchlistController.convertToPosition,
)

// ─── Alert Management ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/watchlist/{symbol}/alerts:
 *   post:
 *     summary: Create a price alert for a symbol
 *     tags: [Watchlist]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [price_above, price_below, percentage_change, volume_spike]
 *               value:
 *                 type: number
 *               message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Alert created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 *   get:
 *     summary: Get all alerts for a symbol
 *     tags: [Watchlist]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of alerts for the symbol
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.post('/:symbol/alerts', WatchlistController.createAlert)
router.get('/:symbol/alerts', WatchlistController.getAlerts)

/**
 * @swagger
 * /api/v1/watchlist/{symbol}/alerts/{id}:
 *   patch:
 *     summary: Update an alert
 *     tags: [Watchlist]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               value:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Alert updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 *   delete:
 *     summary: Delete an alert
 *     tags: [Watchlist]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Alert deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.patch('/:symbol/alerts/:id', WatchlistController.updateAlert)
router.delete('/:symbol/alerts/:id', WatchlistController.deleteAlert)

export default router
