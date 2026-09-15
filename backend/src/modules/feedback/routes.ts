import { Router } from 'express'
import * as FeedbackController from './controller'
import { authTokenMiddleware as authenticate } from '../auth'
import { Action, allRbacMiddleware, rbacMiddleware, Resource } from '../access-control'

const router = Router()

router.use(authenticate)

router.post(
  '/',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  FeedbackController.createFeedback,
)

// Admin-only listing — same gate used by the other admin pages
// (access-control/users, /roles, /overview).
router.get(
  '/',
  allRbacMiddleware(
    { resource: Resource.ACCESS_CONTROL, action: Action.READ },
    { resource: Resource.ROLE, action: Action.READ },
  ),
  FeedbackController.getAllFeedback,
)

export default router
