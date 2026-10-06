import { AdminAuditAction, Prisma, PrismaClient } from '@prisma/client'
import { logger } from '../../shared/infrastructure/logger'
import { redactPii } from '../../shared/utils/redact'

type DbClient = PrismaClient | Prisma.TransactionClient

export enum AdminTargetType {
  USER = 'USER',
  TEAM = 'TEAM',
  TEAM_DOMAIN = 'TEAM_DOMAIN',
  SUBSCRIPTION = 'SUBSCRIPTION',
  PAYMENT = 'PAYMENT',
  CREDIT_LEDGER = 'CREDIT_LEDGER',
  SYSTEM = 'SYSTEM',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
}

/** Stable `targetId` for read audits, which cover a result set rather than one record. */
export const ADMIN_READ_TARGET_ID = 'SEARCH'
export const ADMIN_READ_REASON = 'Staff read access'

/** Cap on result ids stored per read audit row (ids only, never the data itself). */
const MAX_AUDITED_RESULT_IDS = 100

export interface AdminAuditEvent {
  adminId: string
  action: AdminAuditAction
  targetType: AdminTargetType
  targetId: string
  reason: string
  /** Support ticket this action answers, when the requester supplied one. */
  ticketRef?: string
  metadata?: Prisma.InputJsonObject
  ipAddress?: string
}

export interface AdminReadEvent {
  adminId: string
  targetType: AdminTargetType
  /** Ids of the records returned to the staff member. */
  resultIds: readonly string[]
  /** Names of the filters used (never their values, which may be personal data). */
  filterKeys?: readonly string[]
  ipAddress?: string
}

/**
 * Appends an immutable row to `admin_audit_logs`. Always pass the surrounding
 * transaction client so the mutation and its audit record commit or roll back
 * together. Free-text (reason) is scrubbed of emails/phone numbers. The
 * structured log line carries identifiers only: no reason, IP or metadata.
 */
export async function logAdminAction(
  client: DbClient,
  event: AdminAuditEvent,
): Promise<void> {
  await client.adminAuditLog.create({
    data: {
      adminId: event.adminId,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      reason: redactPii(event.reason),
      ticketRef: event.ticketRef,
      metadata: event.metadata,
      ipAddress: event.ipAddress,
    },
  })

  logger.info('[Admin] action recorded', {
    adminId: event.adminId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    ...(event.ticketRef ? { ticketRef: event.ticketRef } : {}),
  })
}

/**
 * Records that a staff member viewed customer data. Stores which records were
 * returned (ids) but not what was searched for or what was shown. Awaited by
 * the caller before responding, so an unrecorded read never reaches the client.
 */
export async function logAdminRead(
  client: DbClient,
  event: AdminReadEvent,
): Promise<void> {
  await logAdminAction(client, {
    adminId: event.adminId,
    action: AdminAuditAction.CUSTOMER_DATA_VIEWED,
    targetType: event.targetType,
    targetId: ADMIN_READ_TARGET_ID,
    reason: ADMIN_READ_REASON,
    ipAddress: event.ipAddress,
    metadata: {
      resultCount: event.resultIds.length,
      resultIds: event.resultIds.slice(0, MAX_AUDITED_RESULT_IDS),
      filterKeys: [...(event.filterKeys ?? [])],
    },
  })
}
