import type { PlanTier } from '@prisma/client'
import type * as express from 'express'
import type { ActiveMembership } from './infrastructure/team-access'

/**
 * The Express request after authentication (and, optionally, team-context
 * attachment). Lives in shared/ so shared middleware and utilities can use it
 * without depending on the auth module, which re-exports it for its own callers.
 */
export interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string
    jti?: string
    roleId?: string
    plan: PlanTier
  }
  file?: Express.Multer.File
  /** Set by `attachTeamContext`: workspace membership + queue priority. */
  teamContext?: {
    membership: ActiveMembership | null
    priority: 'HIGH' | 'NORMAL'
    /** True when this request should jump the compute queue (Team member in a market spike window). */
    isHighPriority: boolean
  }
}
