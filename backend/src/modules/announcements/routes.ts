import { Router } from 'express'
import { authTokenMiddleware } from '../auth'
import * as AnnouncementsController from './controller'
import { requireAnnouncementsEnabled } from './guard'

const router = Router()

router.use(requireAnnouncementsEnabled, authTokenMiddleware)

router.get('/', AnnouncementsController.getChangelog)
// What the app evaluates on boot, for refetching after a change without reloading the profile.
router.get('/boot', AnnouncementsController.getBoot)
// Registered before '/:id/*' so "seen" is never read as an id.
router.post('/seen', AnnouncementsController.markAllAnnouncementsSeen)
router.post('/:id/seen', AnnouncementsController.markAnnouncementSeen)
router.post('/:id/dismiss', AnnouncementsController.dismissAnnouncement)

export default router
