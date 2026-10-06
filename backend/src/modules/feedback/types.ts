import type { FeedbackCategory, FeedbackStatus, PlanTier } from '@prisma/client'

/** What is stored in `Feedback.metadata`: the browser's report plus the plan the server saw. */
export interface FeedbackMetadata {
  userAgent?: string
  viewport?: { width: number; height: number }
  appVersion?: string
  /** Always taken from the authenticated session, never from the client. */
  planTier: PlanTier
}

export interface FeedbackEntry {
  id: string
  userId: string
  message: string
  page: string | null
  category: FeedbackCategory | null
  status: FeedbackStatus
  metadata: unknown
  createdAt: Date
}

export interface FeedbackListRow {
  id: string
  message: string
  page: string | null
  category: FeedbackCategory | null
  status: FeedbackStatus
  metadata: unknown
  statusUpdatedAt: Date | null
  createdAt: Date
  user: {
    id: string
    displayName: string
    email: string
  }
}

/** How many entries sit in each triage state, across the whole inbox (not just the current filter). */
export type FeedbackStatusCounts = Record<FeedbackStatus, number>

export interface FeedbackListResult {
  data: FeedbackListRow[]
  nextCursor: string | null
  hasMore: boolean
  /** Entries matching the current filter. */
  total: number
  counts: FeedbackStatusCounts
}

export interface FeedbackStatusChange {
  id: string
  status: FeedbackStatus
  statusUpdatedAt: Date | null
  /** False when it already had that status (nothing written). */
  changed: boolean
}
