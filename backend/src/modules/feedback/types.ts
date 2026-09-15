export interface FeedbackEntry {
  id: string
  userId: string
  message: string
  page: string | null
  createdAt: Date
}

export interface FeedbackListRow {
  id: string
  message: string
  page: string | null
  createdAt: Date
  user: {
    id: string
    displayName: string
    email: string
  }
}

export interface FeedbackListResult {
  data: FeedbackListRow[]
  nextCursor: string | null
  hasMore: boolean
  total: number
}
