import { Router } from 'express'
import * as NotificationController from './controller'
import { authTokenMiddleware as authenticate } from '../auth'

const router = Router()

router.use(authenticate)

router.get('/', NotificationController.getNotifications)
router.get('/summary', NotificationController.getNotificationSummary)

router.patch('/read-all', NotificationController.markAllAsRead)
router.patch('/read-multiple', NotificationController.markMultipleAsRead)

router.patch('/:id/read', NotificationController.markAsRead)
router.delete('/:id', NotificationController.deleteNotification)

router.post('/digest/send', NotificationController.sendTestDigest)

export default router
