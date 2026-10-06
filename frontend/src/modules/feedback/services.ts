import api from '@/shared/api/axios'
import {
  FeedbackStatus,
  type FeedbackEntry,
  type FeedbackListFilters,
  type FeedbackListResult,
  type SubmitFeedbackInput,
} from './types'

const BASE = '/api/v1/feedback'

export const feedbackService = {
  submit: async (input: SubmitFeedbackInput): Promise<FeedbackEntry> => {
    const res = await api.post(BASE, input)
    return res.data.data
  },

  list: async (
    filters: FeedbackListFilters = {},
  ): Promise<FeedbackListResult> => {
    const res = await api.get(BASE, {
      params: { cursor: filters.cursor, status: filters.status },
    })
    return {
      data: res.data?.data ?? [],
      nextCursor: res.data?.extra?.nextCursor ?? null,
      hasMore: res.data?.extra?.hasMore ?? false,
      total: res.data?.extra?.total ?? 0,
      counts: {
        [FeedbackStatus.NEW]: res.data?.extra?.counts?.NEW ?? 0,
        [FeedbackStatus.READ]: res.data?.extra?.counts?.READ ?? 0,
        [FeedbackStatus.ARCHIVED]: res.data?.extra?.counts?.ARCHIVED ?? 0,
      },
    }
  },

  setStatus: async (id: string, status: FeedbackStatus): Promise<void> => {
    await api.patch(`${BASE}/${id}/status`, { status })
  },
}
