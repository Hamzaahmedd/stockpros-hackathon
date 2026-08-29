import { Router } from 'express'
import { authTokenMiddleware } from '../auth'
import * as NewsController from './controller'

const router = Router()

router.use(authTokenMiddleware)

/**
 * @swagger
 * tags:
 *   - name: News
 *     description: Multi-source news aggregation, sentiment, and read tracking
 */

/**
 * @swagger
 * /api/v1/news/feed:
 *   get:
 *     summary: Get the news feed
 *     tags: [News]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated news feed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.get('/feed', NewsController.getNewsFeed)

/**
 * @swagger
 * /api/v1/news/search:
 *   get:
 *     summary: Search news articles
 *     tags: [News]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Matching articles
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.get('/search', NewsController.searchNews)

/**
 * @swagger
 * /api/v1/news/summary:
 *   get:
 *     summary: Get news summary
 *     tags: [News]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count and top headlines
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.get('/summary', NewsController.getNewsSummary)

/**
 * @swagger
 * /api/v1/news/saved:
 *   get:
 *     summary: Get saved/bookmarked articles
 *     tags: [News]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Saved articles
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.get('/saved', NewsController.getSavedNews)

/**
 * @swagger
 * /api/v1/news/symbol/{symbol}:
 *   get:
 *     summary: Get news for a specific symbol
 *     tags: [News]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *         example: AAPL
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Articles related to the symbol
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.get('/symbol/:symbol', NewsController.getNewsBySymbol)

/**
 * @swagger
 * /api/v1/news/read-all:
 *   patch:
 *     summary: Mark all articles as read
 *     tags: [News]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All articles marked as read
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.patch('/read-all', NewsController.markAllAsRead)

/**
 * @swagger
 * /api/v1/news/read-multiple:
 *   patch:
 *     summary: Mark multiple articles as read
 *     tags: [News]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [articleIds]
 *             properties:
 *               articleIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Selected articles marked as read
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.patch('/read-multiple', NewsController.markMultipleAsRead)

/**
 * @swagger
 * /api/v1/news/{id}/read:
 *   patch:
 *     summary: Mark a single article as read
 *     tags: [News]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Article marked as read
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.patch('/:id/read', NewsController.markAsRead)

/**
 * @swagger
 * /api/v1/news/{id}/save:
 *   post:
 *     summary: Save/bookmark an article
 *     tags: [News]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Article saved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 *   delete:
 *     summary: Remove an article from saved
 *     tags: [News]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Article removed from saved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.post('/:id/save', NewsController.saveArticle)
router.delete('/:id/save', NewsController.unsaveArticle)

export default router
