/** Mirrors the backend `FeedbackCategory` enum. */
export enum FeedbackCategory {
  BUG = 'BUG',
  FEATURE_REQUEST = 'FEATURE_REQUEST',
  GENERAL = 'GENERAL',
}

/** Mirrors the backend `FeedbackStatus` enum: the triage state an admin sets. */
export enum FeedbackStatus {
  NEW = 'NEW',
  READ = 'READ',
  ARCHIVED = 'ARCHIVED',
}

/** What the browser reports with a submission. The server adds the plan itself. */
export interface FeedbackClientMetadata {
  userAgent?: string
  viewport?: { width: number; height: number }
  appVersion?: string
}

/** What is stored: the browser's report plus the plan the server saw. */
export interface FeedbackMetadata extends FeedbackClientMetadata {
  planTier?: 'FREE' | 'PRO' | 'TEAM'
}

export interface FeedbackEntry {
  id: string
  userId: string
  message: string
  page: string | null
  category: FeedbackCategory | null
  status: FeedbackStatus
  createdAt: string
}

export interface SubmitFeedbackInput {
  message: string
  page?: string
  category?: FeedbackCategory
  metadata?: FeedbackClientMetadata
}

export interface FeedbackListRow {
  id: string
  message: string
  page: string | null
  category: FeedbackCategory | null
  status: FeedbackStatus
  metadata: FeedbackMetadata | null
  statusUpdatedAt: string | null
  createdAt: string
  user: {
    id: string
    displayName: string
    email: string
  }
}

export type FeedbackStatusCounts = Record<FeedbackStatus, number>

export interface FeedbackListResult {
  data: FeedbackListRow[]
  nextCursor: string | null
  hasMore: boolean
  /** Entries matching the status filter. */
  total: number
  /** Entries per status across the whole inbox. */
  counts: FeedbackStatusCounts
}

export interface FeedbackListFilters {
  cursor?: string
  status?: FeedbackStatus
}
