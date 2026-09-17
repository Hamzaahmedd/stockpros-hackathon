import { Router } from 'express'
import * as NotificationController from './controller'
import { authTokenMiddleware as authenticate } from '../auth'
import { Action, rbacMiddleware, Resource } from '../access-control'

const router = Router()

router.use(authenticate)

router.get(
  '/',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  NotificationController.getNotifications,
)
router.get(
  '/summary',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  NotificationController.getNotificationSummary,
)
router.get(
  '/preferences',
  rbacMiddleware(Resource.CORE_APP, Action.READ),
  NotificationController.getPreferences,
)
router.patch(
  '/preferences',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  NotificationController.updatePreferences,
)

router.patch(
  '/read-all',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  NotificationController.markAllAsRead,
)
router.patch(
  '/read-multiple',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  NotificationController.markMultipleAsRead,
)

router.patch(
  '/:id/read',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  NotificationController.markAsRead,
)

export default router
