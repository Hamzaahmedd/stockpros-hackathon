import { Router } from 'express'
import { authTokenMiddleware } from '../auth'
import * as NewsController from './controller'

const router = Router()

router.use(authTokenMiddleware)

router.get('/feed', NewsController.getNewsFeed)
router.get('/search', NewsController.searchNews)
router.get('/summary', NewsController.getNewsSummary)
router.get('/saved', NewsController.getSavedNews)
router.get('/symbol/:symbol', NewsController.getNewsBySymbol)

router.patch('/read-all', NewsController.markAllAsRead)
router.patch('/read-multiple', NewsController.markMultipleAsRead)
router.patch('/:id/read', NewsController.markAsRead)
router.post('/:id/save', NewsController.saveArticle)
router.delete('/:id/save', NewsController.unsaveArticle)

export default router
