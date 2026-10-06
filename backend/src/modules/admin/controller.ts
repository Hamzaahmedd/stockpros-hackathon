import { AdminAuditAction } from '@prisma/client'
import { NextFunction, Response } from 'express'
import { UnauthorizedError, validateOrThrow } from '../../shared/errors'
import { getUserId, sendSuccess } from '../../shared/utils'
import { AdminTargetType, alertAdminAction } from '../access-control'
import { AuthenticatedRequest } from '../auth'
import * as Announcements from './announcements-service'
import * as Billing from './billing-service'
import * as Sso from './sso-service'
import * as System from './system-service'
import * as StepUp from './step-up-service'
import * as Teams from './teams-service'
import * as Telemetry from './telemetry-service'
import * as Timeline from './timeline-service'
import * as Usage from './usage-service'
import { AdminCreditTarget, MARKET_EMERGENCY_TARGET_ID } from './constants'
import type { AdminReadContext, AdminWriteContext } from './types'
import { notifySpendLimitChanged } from './spend-limit-notice'
import * as Users from './users-service'
import {
  announcementActionValidator,
  announcementListQueryValidator,
  createAnnouncementValidator,
  updateAnnouncementValidator,
} from './announcement-validation'
import {
  auditLogQueryValidator,
  capacityValidator,
  creditAdjustmentValidator,
  extendSubscriptionValidator,
  idParamValidator,
  marketEmergencyValidator,
  planOverrideValidator,
  domainParamValidator,
  reasonBodyValidator,
  searchQueryValidator,
  spendLimitValidator,
  stepUpVerifyValidator,
  timelineQueryValidator,
  creditLedgerQueryValidator,
  userIdParamValidator,
  webhookQueryValidator,
} from './validation'

/** Wraps a service call in the standard envelope + error forwarding. */
const handle =
  (
    message: string,
    run: (req: AuthenticatedRequest) => Promise<unknown> | unknown,
    statusCode = 200,
  ) =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await run(req)
      return sendSuccess(res, { message, statusCode, data })
    } catch (error) {
      next(error)
    }
  }

const writeContext = (
  req: AuthenticatedRequest,
  reason: string,
  ticketRef?: string,
): AdminWriteContext => ({
  adminId: getUserId(req),
  reason,
  ticketRef,
  ipAddress: req.ip,
})

const readContext = (req: AuthenticatedRequest): AdminReadContext => ({
  adminId: getUserId(req),
  ipAddress: req.ip,
})

// ─── Users ───────────────────────────────────────────────────────────────────
export const searchUsers = handle('Users fetched', (req) => {
  const { q, limit } = validateOrThrow(searchQueryValidator, req.query)
  return Users.searchUsers(readContext(req), q, limit)
})

export const overridePlan = handle('Plan overridden', async (req) => {
  const { id } = validateOrThrow(idParamValidator, req.params)
  const { plan, reason, ticketRef } = validateOrThrow(
    planOverrideValidator,
    req.body,
  )
  const result = await Users.overridePlan(
    writeContext(req, reason, ticketRef),
    id,
    plan,
  )
  void alertAdminAction({
    adminId: getUserId(req),
    action: AdminAuditAction.PLAN_OVERRIDE,
    targetType: AdminTargetType.USER,
    targetId: id,
    ticketRef,
  })
  return result
})

export const overrideSpendLimit = handle(
  'Spend limit overridden',
  async (req) => {
    const { id } = validateOrThrow(idParamValidator, req.params)
    const { monthlyLimitPaisa, reason, ticketRef } = validateOrThrow(
      spendLimitValidator,
      req.body,
    )
    const result = await Users.overrideSpendLimit(
      writeContext(req, reason, ticketRef),
      id,
      monthlyLimitPaisa,
    )
    // After the commit, and never awaited: a mail problem must not fail the change.
    void notifySpendLimitChanged({ ...result, ticketRef })
    void alertAdminAction({
      adminId: getUserId(req),
      action: AdminAuditAction.SPEND_LIMIT_OVERRIDDEN,
      targetType: AdminTargetType.USER,
      targetId: id,
      ticketRef,
    })
    return result
  },
)

export const getUserTimeline = handle('Timeline fetched', (req) => {
  const { id } = validateOrThrow(idParamValidator, req.params)
  const query = validateOrThrow(timelineQueryValidator, req.query)
  return Timeline.getUserTimeline(readContext(req), id, query)
})

export const getUserUsage = handle('Usage fetched', (req) => {
  const { id } = validateOrThrow(idParamValidator, req.params)
  return Usage.getUserUsage(readContext(req), id)
})

/** The authenticated staff member and the session this request belongs to. */
const stepUpActor = (req: AuthenticatedRequest): StepUp.StepUpActor => {
  const sessionId = req.user?.sessionId
  if (!sessionId) throw new UnauthorizedError('Please sign in again')
  return { userId: getUserId(req), sessionId }
}

export const requestStepUp = handle('Verification code sent', (req) =>
  StepUp.requestStepUp(stepUpActor(req)),
)

export const verifyStepUp = handle('Identity verified', (req) =>
  StepUp.verifyStepUp(
    stepUpActor(req),
    validateOrThrow(stepUpVerifyValidator, req.body).code,
  ),
)

export const revealUser = handle('Customer data revealed', (req) => {
  const { id } = validateOrThrow(idParamValidator, req.params)
  const { reason, ticketRef } = validateOrThrow(reasonBodyValidator, req.body)
  return Users.revealUser(writeContext(req, reason, ticketRef), id)
})

export const invalidateSessions = handle(
  'Sessions invalidated',
  async (req) => {
    const { id } = validateOrThrow(idParamValidator, req.params)
    const { reason, ticketRef } = validateOrThrow(reasonBodyValidator, req.body)
    const result = await Users.invalidateSessions(
      writeContext(req, reason, ticketRef),
      id,
    )
    void alertAdminAction({
      adminId: getUserId(req),
      action: AdminAuditAction.USER_SESSION_INVALIDATED,
      targetType: AdminTargetType.USER,
      targetId: id,
      ticketRef,
    })
    return result
  },
)

// ─── Teams ───────────────────────────────────────────────────────────────────
export const searchTeams = handle('Teams fetched', (req) => {
  const { q, limit } = validateOrThrow(searchQueryValidator, req.query)
  return Teams.searchTeams(readContext(req), q, limit)
})

export const setSeatCapacity = handle('Seat capacity updated', (req) => {
  const { id } = validateOrThrow(idParamValidator, req.params)
  const { seatCapacity, reason, ticketRef } = validateOrThrow(
    capacityValidator,
    req.body,
  )
  return Teams.setSeatCapacity(
    writeContext(req, reason, ticketRef),
    id,
    seatCapacity,
  )
})

export const forceVerifyDomain = handle('Domain verified', (req) => {
  const { id } = validateOrThrow(idParamValidator, req.params)
  const { reason, ticketRef } = validateOrThrow(reasonBodyValidator, req.body)
  return Teams.forceVerifyDomain(writeContext(req, reason, ticketRef), id)
})

export const getTeamSso = handle('SSO configuration fetched', (req) => {
  const { domain } = validateOrThrow(domainParamValidator, req.params)
  return Sso.getTeamSso(readContext(req), domain)
})

/** Runs a staff SSO write and sends the risky-action alert once it has committed. */
const ssoWrite = (
  message: string,
  action: AdminAuditAction,
  run: (ctx: AdminWriteContext, domain: string) => Promise<unknown>,
) =>
  handle(message, async (req) => {
    const { domain } = validateOrThrow(domainParamValidator, req.params)
    const { reason, ticketRef } = validateOrThrow(reasonBodyValidator, req.body)
    const result = await run(writeContext(req, reason, ticketRef), domain)
    void alertAdminAction({
      adminId: getUserId(req),
      action,
      targetType: AdminTargetType.TEAM_DOMAIN,
      targetId: domain,
      ticketRef,
    })
    return result
  })

export const disableTeamSso = ssoWrite(
  'SSO disabled',
  AdminAuditAction.SAML_DISABLED,
  Sso.disableSso,
)

export const resetTeamSso = ssoWrite(
  'SSO configuration reset',
  AdminAuditAction.SAML_CONFIG_RESET,
  Sso.resetSso,
)

export const resetAuthPolicy = handle('Auth policy reset', async (req) => {
  const { domain } = validateOrThrow(domainParamValidator, req.params)
  const { reason, ticketRef } = validateOrThrow(reasonBodyValidator, req.body)
  const result = await Teams.resetAuthPolicy(
    writeContext(req, reason, ticketRef),
    domain,
  )
  void alertAdminAction({
    adminId: getUserId(req),
    action: AdminAuditAction.AUTH_POLICY_RESET,
    targetType: AdminTargetType.TEAM_DOMAIN,
    targetId: domain,
    ticketRef,
  })
  return result
})

export const forceRemoveMember = handle('Member removed', async (req) => {
  const { userId } = validateOrThrow(userIdParamValidator, req.params)
  const { reason, ticketRef } = validateOrThrow(reasonBodyValidator, req.body)
  const result = await Teams.forceRemoveMember(
    writeContext(req, reason, ticketRef),
    userId,
  )
  void alertAdminAction({
    adminId: getUserId(req),
    action: AdminAuditAction.MEMBER_FORCE_REMOVED,
    targetType: AdminTargetType.USER,
    targetId: userId,
    ticketRef,
  })
  return result
})

// ─── Billing ─────────────────────────────────────────────────────────────────
export const listWebhooks = handle('Webhooks fetched', (req) =>
  Billing.listWebhooks(
    readContext(req),
    validateOrThrow(webhookQueryValidator, req.query),
  ),
)

export const retryWebhook = handle('Webhook reprocessed', (req) => {
  const { id } = validateOrThrow(idParamValidator, req.params)
  const { reason, ticketRef } = validateOrThrow(reasonBodyValidator, req.body)
  return Billing.retryWebhook(writeContext(req, reason, ticketRef), id)
})

export const adjustCredits = handle('Credits adjusted', async (req) => {
  const { reason, ticketRef, ...input } = validateOrThrow(
    creditAdjustmentValidator,
    req.body,
  )
  const result = await Billing.adjustCredits(
    writeContext(req, reason, ticketRef),
    input,
  )
  void alertAdminAction({
    adminId: getUserId(req),
    action: AdminAuditAction.CREDIT_INJECTION,
    targetType:
      input.target === AdminCreditTarget.USER
        ? AdminTargetType.USER
        : AdminTargetType.TEAM,
    targetId: input.targetId,
    ticketRef,
    amountPaisa: input.amountPaisa,
  })
  return result
})

export const extendSubscription = handle('Subscription extended', (req) => {
  const { id } = validateOrThrow(idParamValidator, req.params)
  const { reason, ticketRef, ...input } = validateOrThrow(
    extendSubscriptionValidator,
    req.body,
  )
  return Billing.extendSubscription(
    writeContext(req, reason, ticketRef),
    id,
    input,
  )
})

// ─── Telemetry ───────────────────────────────────────────────────────────────
export const listCreditLedger = handle('Credit ledger fetched', (req) =>
  Billing.listCreditLedger(
    readContext(req),
    validateOrThrow(creditLedgerQueryValidator, req.query),
  ),
)

export const getQueueHealth = handle('Queue health fetched', () =>
  Telemetry.getQueueHealth(),
)

// ─── System ──────────────────────────────────────────────────────────────────
export const getMarketStatus = handle('Market status fetched', () =>
  System.getMarketStatus(),
)

export const setMarketEmergency = handle(
  'Market emergency updated',
  async (req) => {
    const { closed, reason, ticketRef } = validateOrThrow(
      marketEmergencyValidator,
      req.body,
    )
    const result = await System.setMarketEmergency(
      writeContext(req, reason, ticketRef),
      closed,
    )
    void alertAdminAction({
      adminId: getUserId(req),
      action: AdminAuditAction.EMERGENCY_MARKET_TOGGLED,
      targetType: AdminTargetType.SYSTEM,
      targetId: MARKET_EMERGENCY_TARGET_ID,
      ticketRef,
    })
    return result
  },
)

export const listAuditLogs = handle('Audit logs fetched', (req) =>
  System.listAuditLogs(validateOrThrow(auditLogQueryValidator, req.query)),
)

// ─── Announcements ───────────────────────────────────────────────────────────
export const listAnnouncements = handle('Announcements fetched', (req) =>
  Announcements.listAnnouncements(
    validateOrThrow(announcementListQueryValidator, req.query),
  ),
)

export const getAnnouncement = handle('Announcement fetched', (req) => {
  const { id } = validateOrThrow(idParamValidator, req.params)
  return Announcements.getAnnouncement(id)
})

export const createAnnouncement = handle('Announcement created', (req) => {
  const input = validateOrThrow(createAnnouncementValidator, req.body)
  return Announcements.createAnnouncement(
    writeContext(req, input.reason, input.ticketRef),
    input,
  )
})

export const updateAnnouncement = handle('Announcement updated', (req) => {
  const { id } = validateOrThrow(idParamValidator, req.params)
  const input = validateOrThrow(updateAnnouncementValidator, req.body)
  return Announcements.updateAnnouncement(
    writeContext(req, input.reason, input.ticketRef),
    id,
    input,
  )
})

/** Builds a handler for the id-only lifecycle actions, which carry just a reason and ticket. */
const announcementAction = (
  message: string,
  run: (ctx: AdminWriteContext, id: string) => Promise<unknown>,
) =>
  handle(message, (req) => {
    const { id } = validateOrThrow(idParamValidator, req.params)
    const { reason, ticketRef } = validateOrThrow(
      announcementActionValidator,
      req.body,
    )
    return run(writeContext(req, reason, ticketRef), id)
  })

export const publishAnnouncement = announcementAction(
  'Announcement published',
  Announcements.publishAnnouncement,
)

/** Switching an announcement on or off changes what every user sees, so it alerts. A no-op (already in that state) does not. */
const switchAnnouncement = async (
  ctx: AdminWriteContext,
  id: string,
  isEnabled: boolean,
) => {
  const result = await Announcements.setAnnouncementEnabled(ctx, id, isEnabled)
  if (result.changed) {
    void alertAdminAction({
      adminId: ctx.adminId,
      action: AdminAuditAction.ANNOUNCEMENT_KILL_SWITCH_TOGGLED,
      targetType: AdminTargetType.ANNOUNCEMENT,
      targetId: id,
      ticketRef: ctx.ticketRef,
      outcome: isEnabled ? 'ENABLED' : 'DISABLED',
    })
  }
  return result
}

export const disableAnnouncement = announcementAction(
  'Announcement switched off',
  (ctx, id) => switchAnnouncement(ctx, id, false),
)

export const enableAnnouncement = announcementAction(
  'Announcement switched on',
  (ctx, id) => switchAnnouncement(ctx, id, true),
)

export const reannounceAnnouncement = announcementAction(
  'Announcement re-announced',
  Announcements.reannounceAnnouncement,
)

export const archiveAnnouncement = announcementAction(
  'Announcement archived',
  Announcements.archiveAnnouncement,
)
