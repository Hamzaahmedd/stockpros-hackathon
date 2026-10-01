import { AdminAuditAction, Prisma } from '@prisma/client'
import { prisma } from '../../shared/infrastructure/database'
import {
  isEmergencyClosed,
  setEmergencyClosed,
} from '../../shared/utils/market-hours'
import { AdminTargetType, logAdminAction } from '../access-control'
import { MARKET_EMERGENCY_TARGET_ID } from './constants'
import type { AdminWriteContext } from './types'

export interface AuditLogQuery {
  page: number
  limit: number
  adminId?: string
  action?: AdminAuditAction
  targetType?: string
  targetId?: string
}

export const getMarketStatus = () => ({ emergencyClosed: isEmergencyClosed() })

/**
 * Flips the in-memory emergency-close flag (no restart). The audit row is
 * written first so a toggle can never go unrecorded. Per-process state: in a
 * multi-instance deployment only the handling instance is affected.
 */
export async function setMarketEmergency(
  ctx: AdminWriteContext,
  closed: boolean,
) {
  const previous = isEmergencyClosed()
  await logAdminAction(prisma, {
    adminId: ctx.adminId,
    action: AdminAuditAction.EMERGENCY_MARKET_TOGGLED,
    targetType: AdminTargetType.SYSTEM,
    targetId: MARKET_EMERGENCY_TARGET_ID,
    reason: ctx.reason,
    ipAddress: ctx.ipAddress,
    metadata: { previous, closed },
  })
  setEmergencyClosed(closed)
  return { emergencyClosed: closed, previous }
}

export async function listAuditLogs(query: AuditLogQuery) {
  const where: Prisma.AdminAuditLogWhereInput = {
    ...(query.adminId ? { adminId: query.adminId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.targetType ? { targetType: query.targetType } : {}),
    ...(query.targetId ? { targetId: query.targetId } : {}),
  }
  const [total, items] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { admin: { select: { id: true, displayName: true } } },
    }),
  ])
  return { items, total, page: query.page, limit: query.limit }
}
