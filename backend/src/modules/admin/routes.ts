import { PlatformRole } from '@prisma/client'
import { Router } from 'express'
import {
  requireAllowedIp,
  requirePlatformRole,
  requirePricingTiersEnabled,
  requireStepUp,
} from '../access-control'
import {
  adminRateLimiter,
  adminWriteLimiter,
} from '../../shared/middlewares/security'
import * as AdminController from './controller'

const router = Router()

// Tier-based workflow only: every route (including unknown paths) answers
// 403 FORBIDDEN_FEATURE_DISABLED while pricingTiersEnabled is false.
router.use(requirePricingTiersEnabled, requireAllowedIp, adminRateLimiter)

const support = requirePlatformRole(PlatformRole.SUPPORT_AGENT)
// Requesting/verifying a step-up code is a staff action in its own right (limited, never itself step-up gated).
const stepUpAccess = [...support, adminWriteLimiter]
// Revealing customer data is audited like a write, so it is step-up gated and write limited.
const supportWrite = [...support, requireStepUp, adminWriteLimiter]
// Writes also pass the per-staff-member limiter, which needs the authenticated user.
const platformAdmin = [
  ...requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  requireStepUp,
  adminWriteLimiter,
]
const superAdmin = [
  ...requirePlatformRole(PlatformRole.SUPER_ADMIN),
  requireStepUp,
  adminWriteLimiter,
]

// ─── Step-up verification ────────────────────────────────────────────────────
router.post('/step-up/request', ...stepUpAccess, AdminController.requestStepUp)
router.post('/step-up/verify', ...stepUpAccess, AdminController.verifyStepUp)

// ─── Users ───────────────────────────────────────────────────────────────────
router.get('/users/search', ...support, AdminController.searchUsers)
router.get('/users/:id/timeline', ...support, AdminController.getUserTimeline)
router.post('/users/:id/reveal', ...supportWrite, AdminController.revealUser)
router.post(
  '/users/:id/plan-override',
  ...superAdmin,
  AdminController.overridePlan,
)
router.post(
  '/users/:id/sessions/invalidate',
  ...superAdmin,
  AdminController.invalidateSessions,
)

// ─── Teams ───────────────────────────────────────────────────────────────────
router.get('/teams/search', ...support, AdminController.searchTeams)
router.patch(
  '/teams/:id/capacity',
  ...platformAdmin,
  AdminController.setSeatCapacity,
)
router.post(
  '/teams/domains/:id/verify',
  ...platformAdmin,
  AdminController.forceVerifyDomain,
)
router.get('/teams/domains/:domain/sso', ...support, AdminController.getTeamSso)
router.post(
  '/teams/domains/:domain/sso/disable',
  ...platformAdmin,
  AdminController.disableTeamSso,
)
router.post(
  '/teams/domains/:domain/sso/reset',
  ...platformAdmin,
  AdminController.resetTeamSso,
)
router.post(
  '/teams/domains/:domain/reset-auth-policy',
  ...platformAdmin,
  AdminController.resetAuthPolicy,
)
router.delete(
  '/teams/members/:userId',
  ...platformAdmin,
  AdminController.forceRemoveMember,
)

// ─── Billing ─────────────────────────────────────────────────────────────────
router.get('/billing/webhooks', ...support, AdminController.listWebhooks)
router.post(
  '/billing/webhooks/:id/retry',
  ...platformAdmin,
  AdminController.retryWebhook,
)
router.get(
  '/billing/credit-ledger',
  ...support,
  AdminController.listCreditLedger,
)
router.post(
  '/billing/credits/adjust',
  ...platformAdmin,
  AdminController.adjustCredits,
)
router.post(
  '/subscriptions/:id/extend',
  ...platformAdmin,
  AdminController.extendSubscription,
)

// ─── Telemetry ───────────────────────────────────────────────────────────────
router.get('/telemetry/queues', ...support, AdminController.getQueueHealth)

// ─── System ──────────────────────────────────────────────────────────────────
router.get('/system/market-status', ...support, AdminController.getMarketStatus)
router.post(
  '/system/market-emergency',
  ...superAdmin,
  AdminController.setMarketEmergency,
)
router.get('/system/audit-logs', ...support, AdminController.listAuditLogs)

export default router
