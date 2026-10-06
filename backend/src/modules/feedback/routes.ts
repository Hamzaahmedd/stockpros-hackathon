import { Router } from 'express'
import * as FeedbackController from './controller'
import { feedbackSubmitLimiter } from '../../shared/middlewares/security'
import { authTokenMiddleware as authenticate } from '../auth'
import {
  Action,
  allRbacMiddleware,
  rbacMiddleware,
  Resource,
} from '../access-control'

const router = Router()

router.use(authenticate)

router.post(
  '/',
  rbacMiddleware(Resource.CORE_APP, Action.WRITE),
  feedbackSubmitLimiter,
  FeedbackController.createFeedback,
)

// Admin-only triage — same gate used by the other admin pages
// (access-control/users, /roles, /overview). It applies in both the role-based
// and the tier-based workflow: it checks permissions, not `pricingTiersEnabled`.
const triageAccess = allRbacMiddleware(
  { resource: Resource.ACCESS_CONTROL, action: Action.READ },
  { resource: Resource.ROLE, action: Action.READ },
)

router.get('/', triageAccess, FeedbackController.getAllFeedback)
router.patch('/:id/status', triageAccess, FeedbackController.setFeedbackStatus)

export default router
