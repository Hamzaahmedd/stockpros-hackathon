import { Router } from 'express'
import { Action, rbacMiddleware, Resource } from '../access-control'
import { authTokenMiddleware } from '../auth'
import * as NewsController from './controller'

const router = Router()

router.use(authTokenMiddleware)

router.get(
  '/feed',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  NewsController.getNewsFeed,
)
router.get(
  '/search',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  NewsController.searchNews,
)
router.get(
  '/summary',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  NewsController.getNewsSummary,
)
router.get(
  '/saved',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  NewsController.getSavedNews,
)
router.get(
  '/symbol/:symbol',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  NewsController.getNewsBySymbol,
)

router.patch(
  '/read-all',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  NewsController.markAllAsRead,
)
router.patch(
  '/read-multiple',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  NewsController.markMultipleAsRead,
)
router.patch(
  '/:id/read',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  NewsController.markAsRead,
)
router.post(
  '/:id/save',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  NewsController.saveArticle,
)
router.delete(
  '/:id/save',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  NewsController.unsaveArticle,
)

export default router
