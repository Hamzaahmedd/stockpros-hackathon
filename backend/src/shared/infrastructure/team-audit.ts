import {
  type Prisma,
  type PrismaClient,
  type TeamAuditAction,
} from '@prisma/client'
import { logger } from './logger'

type DbClient = PrismaClient | Prisma.TransactionClient

/** Audit metadata holds IDs and enum values only — never names or email addresses. */
export type TeamAuditMetadata = Readonly<
  Record<string, string | number | boolean | null>
>

export interface TeamAuditEvent {
  teamId: string
  /** Absent for system actions (for example a subscription lapsing). */
  actorUserId?: string
  action: TeamAuditAction
  targetUserId?: string
  metadata?: TeamAuditMetadata
}

/**
 * Appends to the admin audit trail. Pass the surrounding transaction client so
 * the action and its record commit or roll back together.
 */
export async function recordTeamAudit(
  client: DbClient,
  event: TeamAuditEvent,
): Promise<void> {
  await client.teamAuditLog.create({
    data: {
      teamId: event.teamId,
      actorUserId: event.actorUserId ?? null,
      action: event.action,
      targetUserId: event.targetUserId ?? null,
      metadata: event.metadata,
    },
  })
  logger.info('[TeamAudit] recorded', {
    teamId: event.teamId,
    action: event.action,
    ...(event.actorUserId ? { actorUserId: event.actorUserId } : {}),
    ...(event.targetUserId ? { targetUserId: event.targetUserId } : {}),
  })
}
