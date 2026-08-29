import { Router } from 'express'
import { authTokenMiddleware as authenticate } from '../auth'
import { rbacMiddleware } from './middleware'
import { Resource, Action } from './permissions'
import * as RbacController from './controller'

const router = Router()

router.use(authenticate)

/**
 * @swagger
 * tags:
 *   - name: Access Control
 *     description: Role-based access control (RBAC) — users, roles, permissions, and resources
 */

// ─── Users & Screens ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/rbac/user-screens:
 *   get:
 *     summary: Get screen permissions for the current user
 *     tags: [Access Control]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Screen permissions keyed by resource
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.get('/user-screens', RbacController.getUserScreenPermissions)

/**
 * @swagger
 * /api/v1/rbac/users:
 *   get:
 *     summary: List all users (paginated)
 *     tags: [Access Control]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Paginated user list
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     nextCursor:
 *                       type: string
 *                     hasMore:
 *                       type: boolean
 *                     total:
 *                       type: integer
 */
router.get(
  '/users',
  rbacMiddleware(Resource.ROLE, Action.READ),
  RbacController.getAllUsers,
)

// ─── Roles ────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/rbac/roles:
 *   get:
 *     summary: List all roles
 *     tags: [Access Control]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All defined roles
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 *   post:
 *     summary: Create a new role
 *     tags: [Access Control]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Role created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
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

/**
 * @swagger
 * /api/v1/rbac/roles/{roleId}:
 *   delete:
 *     summary: Revoke (delete) a role
 *     tags: [Access Control]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, roleId]
 *             properties:
 *               userId:
 *                 type: string
 *               roleId:
 *                 type: string
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role revoked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.delete(
  '/roles/:roleId',
  rbacMiddleware(Resource.ROLE, Action.DELETE),
  RbacController.revokeRole,
)

/**
 * @swagger
 * /api/v1/rbac/assign-role:
 *   post:
 *     summary: Assign roles to a user
 *     tags: [Access Control]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, roleIds]
 *             properties:
 *               userId:
 *                 type: string
 *               roleIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Role assigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.post(
  '/assign-role',
  rbacMiddleware(Resource.ROLE, Action.CREATE),
  RbacController.assignRole,
)

// ─── Permissions ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/rbac/permissions:
 *   get:
 *     summary: List all permissions
 *     tags: [Access Control]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All defined permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.get(
  '/permissions',
  rbacMiddleware(Resource.ROLE, Action.READ),
  RbacController.getAllPermissions,
)

/**
 * @swagger
 * /api/v1/rbac/assign-permissions:
 *   post:
 *     summary: Assign permissions to a role
 *     tags: [Access Control]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId, permissions]
 *             properties:
 *               roleId:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Permissions assigned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.post(
  '/assign-permissions',
  rbacMiddleware(Resource.ROLE, Action.CREATE),
  RbacController.assignPermissionsToRole,
)

/**
 * @swagger
 * /api/v1/rbac/revoke-permissions:
 *   delete:
 *     summary: Revoke permissions from a role
 *     tags: [Access Control]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId, permissions]
 *             properties:
 *               roleId:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Permissions revoked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.delete(
  '/revoke-permissions',
  rbacMiddleware(Resource.ROLE, Action.DELETE),
  RbacController.revokePermissionsFromRole,
)

// ─── Resources ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/rbac/resources:
 *   get:
 *     summary: List all resources
 *     tags: [Access Control]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All defined resources
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.get(
  '/resources',
  rbacMiddleware(Resource.ROLE, Action.READ),
  RbacController.getAllResources,
)

/**
 * @swagger
 * /api/v1/rbac/resource-mappings:
 *   post:
 *     summary: Assign actions to resources
 *     tags: [Access Control]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resources]
 *             properties:
 *               resources:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     resourceId:
 *                       type: string
 *                     actionIds:
 *                       type: array
 *                       items:
 *                         type: string
 *     responses:
 *       201:
 *         description: Actions assigned to resources
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 */
router.post(
  '/resource-mappings',
  rbacMiddleware(Resource.ROLE, Action.CREATE),
  RbacController.assignActionsToResources,
)

export default router
