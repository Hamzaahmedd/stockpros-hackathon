import { Router } from 'express'
import { authTokenMiddleware as authenticate } from '../auth'
import { rbacMiddleware } from './middleware'
import { Resource, Action } from './permissions'
import * as RbacController from './controller'

const router = Router()

router.use(authenticate)

// ─── Users & Screens ──────────────────────────────────────────────────────────
router.get('/user-screens', RbacController.getUserScreenPermissions)
router.get(
  '/users',
  rbacMiddleware(Resource.ROLE, Action.READ),
  RbacController.getAllUsers,
)

// ─── Roles ────────────────────────────────────────────────────────────────────
router.get(
  '/roles',
  rbacMiddleware(Resource.ROLE, Action.READ),
  RbacController.getAllRoles,
)
router.post(
  '/roles',
  rbacMiddleware(Resource.ROLE, Action.CREATE),
  RbacController.addRole,
)
router.delete(
  '/roles/:roleId',
  rbacMiddleware(Resource.ROLE, Action.DELETE),
  RbacController.revokeRole,
)
router.post(
  '/assign-role',
  rbacMiddleware(Resource.ROLE, Action.CREATE),
  RbacController.assignRole,
)

// ─── Permissions ──────────────────────────────────────────────────────────────
router.get(
  '/permissions',
  rbacMiddleware(Resource.ROLE, Action.READ),
  RbacController.getAllPermissions,
)
router.post(
  '/assign-permissions',
  rbacMiddleware(Resource.ROLE, Action.CREATE),
  RbacController.assignPermissionsToRole,
)
router.delete(
  '/revoke-permissions',
  rbacMiddleware(Resource.ROLE, Action.DELETE),
  RbacController.revokePermissionsFromRole,
)

// ─── Resources ────────────────────────────────────────────────────────────────
router.get(
  '/resources',
  rbacMiddleware(Resource.ROLE, Action.READ),
  RbacController.getAllResources,
)
router.post(
  '/resource-mappings',
  rbacMiddleware(Resource.ROLE, Action.CREATE),
  RbacController.assignActionsToResources,
)

export default router
