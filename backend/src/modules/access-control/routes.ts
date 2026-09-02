import { Router } from 'express'
import { authTokenMiddleware as authenticate } from '../auth'
import { allRbacMiddleware } from './middleware'
import { Resource, Action } from './permissions'
import * as RbacController from './controller'

const router = Router()

const requireRoleAction = (action: Action) =>
  allRbacMiddleware(
    { resource: Resource.ACCESS_CONTROL, action: Action.READ },
    { resource: Resource.ROLE, action },
  )

router.use(authenticate)

// ─── Users & Screens ──────────────────────────────────────────────────────────
router.get('/user-screens', RbacController.getUserScreenPermissions)
router.get('/users', requireRoleAction(Action.READ), RbacController.getAllUsers)

// ─── Roles ────────────────────────────────────────────────────────────────────
router.get('/roles', requireRoleAction(Action.READ), RbacController.getAllRoles)
router.post('/roles', requireRoleAction(Action.WRITE), RbacController.addRole)
router.delete(
  '/roles/:roleId',
  requireRoleAction(Action.DELETE),
  RbacController.revokeRole,
)
router.post(
  '/assign-role',
  requireRoleAction(Action.WRITE),
  RbacController.assignRole,
)

// ─── Permissions ──────────────────────────────────────────────────────────────
router.get(
  '/permissions',
  requireRoleAction(Action.READ),
  RbacController.getAllPermissions,
)
router.post(
  '/assign-permissions',
  requireRoleAction(Action.WRITE),
  RbacController.assignPermissionsToRole,
)
router.delete(
  '/revoke-permissions',
  requireRoleAction(Action.DELETE),
  RbacController.revokePermissionsFromRole,
)

// ─── Resources ────────────────────────────────────────────────────────────────
router.get(
  '/resources',
  requireRoleAction(Action.READ),
  RbacController.getAllResources,
)
router.post(
  '/resource-mappings',
  requireRoleAction(Action.WRITE),
  RbacController.assignActionsToResources,
)

export default router
