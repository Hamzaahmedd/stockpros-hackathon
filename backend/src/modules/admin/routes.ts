import { PlatformRole } from '@prisma/client'
import { Router } from 'express'
import {
  requirePlatformRole,
  requirePricingTiersEnabled,
} from '../access-control'
import {
  adminRateLimiter,
  adminWriteLimiter,
} from '../../shared/middlewares/security'
import * as AdminController from './controller'

const router = Router()

// Tier-based workflow only: every route (including unknown paths) answers
// 403 FORBIDDEN_FEATURE_DISABLED while pricingTiersEnabled is false.
router.use(requirePricingTiersEnabled, adminRateLimiter)

const support = requirePlatformRole(PlatformRole.SUPPORT_AGENT)
// Revealing customer data is audited like a write, so it shares the write limiter.
const supportWrite = [...support, adminWriteLimiter]
// Writes also pass the per-staff-member limiter, which needs the authenticated user.
const platformAdmin = [
  ...requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  adminWriteLimiter,
]
const superAdmin = [
  ...requirePlatformRole(PlatformRole.SUPER_ADMIN),
  adminWriteLimiter,
]

// ─── Users ───────────────────────────────────────────────────────────────────
router.get('/users/search', ...support, AdminController.searchUsers)
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
router.get('/telemetry/usage', ...support, AdminController.searchUsage)
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
