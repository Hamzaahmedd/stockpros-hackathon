import type { NewsSentiment } from '@prisma/client'

// Job payload types are inferred from their zod schemas (single source of truth).
export type {
  AdminActionAlertEmailJobPayload,
  AuthEmailJobPayload,
  EmailJobPayload,
  PaymentReceiptEmailJobPayload,
  RenewalReminderEmailJobPayload,
  StaffStepUpEmailJobPayload,
  TeamInviteEmailJobPayload,
} from './email-job-schemas'

export interface RawNewsInput {
  symbol: string
  headline: string
  rawSummary: string
  sentiment: NewsSentiment | null
  source?: string
  url?: string
}

export interface NotificationItem {
  id: string
  title: string
  body: string
  read: boolean
  createdAt: Date
}

export interface PaginatedNotifications {
  data: NotificationItem[]
  nextCursor: string | null
  hasMore: boolean
  total: number
}

export interface NotificationSummary {
  unreadCount: number
  preview: NotificationItem[]
}

export interface NotificationPreferences {
  marketInterests: string[]
  inAppAlertsEnabled: boolean
  emailVolatilityAlertsEnabled: boolean
  dailyDigestEnabled: boolean
}
