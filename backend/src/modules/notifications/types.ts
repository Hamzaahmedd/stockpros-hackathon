import type { NewsSentiment } from '@prisma/client'

export type AlertType = string

export interface RawNewsInput {
  symbol: string
  headline: string
  rawSummary: string
  sentiment: NewsSentiment | null
  source?: string
  url?: string
}

export interface EmailJobPayload {
  to: string
  symbol: string
  alertType: AlertType
  title: string
  body: string
}

export interface AuthEmailJobPayload {
  to: string
  loginLink: string
  expiryMinutes: number
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
