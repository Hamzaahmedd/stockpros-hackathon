import { NextFunction, Response } from 'express'
import { validateOrThrow } from '../../shared/errors'
import { getUserId, sendSuccess } from '../../shared/utils'
import { AuthenticatedRequest } from '../auth'
import * as Billing from './billing-service'
import * as System from './system-service'
import * as Teams from './teams-service'
import * as Telemetry from './telemetry-service'
import type { AdminReadContext, AdminWriteContext } from './types'
import * as Users from './users-service'
import {
  auditLogQueryValidator,
  capacityValidator,
  creditAdjustmentValidator,
  extendSubscriptionValidator,
  idParamValidator,
  marketEmergencyValidator,
  planOverrideValidator,
  reasonBodyValidator,
  searchQueryValidator,
  usageQueryValidator,
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

export const overridePlan = handle('Plan overridden', (req) => {
  const { id } = validateOrThrow(idParamValidator, req.params)
  const { plan, reason, ticketRef } = validateOrThrow(
    planOverrideValidator,
    req.body,
  )
  return Users.overridePlan(writeContext(req, reason, ticketRef), id, plan)
})

export const invalidateSessions = handle('Sessions invalidated', (req) => {
  const { id } = validateOrThrow(idParamValidator, req.params)
  const { reason, ticketRef } = validateOrThrow(reasonBodyValidator, req.body)
  return Users.invalidateSessions(writeContext(req, reason, ticketRef), id)
})

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

export const forceRemoveMember = handle('Member removed', (req) => {
  const { userId } = validateOrThrow(userIdParamValidator, req.params)
  const { reason, ticketRef } = validateOrThrow(reasonBodyValidator, req.body)
  return Teams.forceRemoveMember(writeContext(req, reason, ticketRef), userId)
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

export const adjustCredits = handle('Credits adjusted', (req) => {
  const { reason, ticketRef, ...input } = validateOrThrow(
    creditAdjustmentValidator,
    req.body,
  )
  return Billing.adjustCredits(writeContext(req, reason, ticketRef), input)
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
export const searchUsage = handle('Usage events fetched', (req) =>
  Telemetry.searchUsage(
    readContext(req),
    validateOrThrow(usageQueryValidator, req.query),
  ),
)

export const getQueueHealth = handle('Queue health fetched', () =>
  Telemetry.getQueueHealth(),
)

// ─── System ──────────────────────────────────────────────────────────────────
export const getMarketStatus = handle('Market status fetched', () =>
  System.getMarketStatus(),
)

export const setMarketEmergency = handle('Market emergency updated', (req) => {
  const { closed, reason, ticketRef } = validateOrThrow(
    marketEmergencyValidator,
    req.body,
  )
  return System.setMarketEmergency(writeContext(req, reason, ticketRef), closed)
})

export const listAuditLogs = handle('Audit logs fetched', (req) =>
  System.listAuditLogs(validateOrThrow(auditLogQueryValidator, req.query)),
)
