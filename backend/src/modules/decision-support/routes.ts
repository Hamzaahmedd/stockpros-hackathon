import { Router } from 'express'
import * as DecisionController from './controller'
import { authTokenMiddleware as authenticate } from '../auth'
import { rbacMiddleware } from '../access-control'
import { upload } from '../../shared/middlewares'
import { Resource, Action } from '../access-control'

const router = Router()

router.use(authenticate)

/**
 * @swagger
 * tags:
 *   - name: Decision Support
 *     description: Trade decisions based on market and portfolio analysis
 */

// ─── Market Intelligence ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/decision-support/market/decision/{symbol}:
 *   get:
 *     summary: Get market-based trade decision for a symbol
 *     tags: [Decision Support]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *         description: Stock ticker symbol
 *         example: AAPL
 *     responses:
 *       200:
 *         description: Buy/sell/hold recommendation with confidence score and risk level
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
 *                         recommendation:
 *                           type: string
 *                           enum: [buy, sell, hold]
 *                         confidence:
 *                           type: number
 *                         riskLevel:
 *                           type: string
 */
router.get(
  '/market/decision/:symbol',
  DecisionController.getMarketBasedTradeDecision,
)

// ─── Portfolio Analysis ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/decision-support/upload-portfolio:
 *   post:
 *     summary: Upload a portfolio CSV/Excel file
 *     tags: [Decision Support]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [portfolio]
 *             properties:
 *               portfolio:
 *                 type: string
 *                 format: binary
 *                 description: CSV or Excel file containing portfolio holdings
 *     responses:
 *       200:
 *         description: Portfolio uploaded and parsed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.post(
  '/upload-portfolio',
  rbacMiddleware(Resource.PORTFOLIO, Action.CREATE),
  upload.single('portfolio'),
  DecisionController.uploadTraderPortfolio,
)

/**
 * @swagger
 * /api/v1/decision-support/portfolio/decision:
 *   post:
 *     summary: Get portfolio-based trade decisions
 *     tags: [Decision Support]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [portfolioId, decisionMode]
 *             properties:
 *               portfolioId:
 *                 type: string
 *               decisionMode:
 *                 type: string
 *                 enum: [conservative, moderate, aggressive]
 *     responses:
 *       200:
 *         description: Trade decisions generated from portfolio analysis
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.post(
  '/portfolio/decision',
  rbacMiddleware(Resource.PORTFOLIO, Action.CREATE),
  DecisionController.getPortfolioBasedTradeDecision,
)

/**
 * @swagger
 * /api/v1/decision-support/portfolio/latest:
 *   get:
 *     summary: Get the latest uploaded portfolio
 *     tags: [Decision Support]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Latest portfolio with holdings
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.get(
  '/portfolio/latest',
  rbacMiddleware(Resource.PORTFOLIO, Action.READ),
  DecisionController.getLatestPortfolio,
)

export default router
