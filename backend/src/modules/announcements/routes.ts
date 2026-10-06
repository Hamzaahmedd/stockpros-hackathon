import { NextFunction, Request, Response, Router } from 'express'
import config from '@/config'
import { FeatureDisabledError } from '../../shared/errors'
import { authTokenMiddleware } from '../auth'
import * as AnnouncementsController from './controller'

const router = Router()

const requireAnnouncementsEnabled = (
  _req: Request,
  _res: Response,
  next: NextFunction,
) =>
  next(
    config.features.enableAnnouncements
      ? undefined
      : new FeatureDisabledError('Announcements are not enabled'),
  )

router.use(requireAnnouncementsEnabled, authTokenMiddleware)

router.get('/', AnnouncementsController.getChangelog)
// Registered before '/:id/*' so "seen" is never read as an id.
router.post('/seen', AnnouncementsController.markAllAnnouncementsSeen)
router.post('/:id/seen', AnnouncementsController.markAnnouncementSeen)
router.post('/:id/dismiss', AnnouncementsController.dismissAnnouncement)

export default router
