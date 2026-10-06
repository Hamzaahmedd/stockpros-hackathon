import api from '@/shared/api/axios'
import { unwrapEnvelope } from '@/shared/api/envelope'
import type { AnnouncementBoot } from './types'

const BASE = '/api/v1/announcements'

export const announcementService = {
  getBoot: async (): Promise<AnnouncementBoot> =>
    unwrapEnvelope<AnnouncementBoot>(await api.get(`${BASE}/boot`)),

  dismiss: async (id: string): Promise<void> => {
    await api.post(`${BASE}/${id}/dismiss`)
  },

  markSeen: async (id: string): Promise<void> => {
    await api.post(`${BASE}/${id}/seen`)
  },

  markAllSeen: async (): Promise<void> => {
    await api.post(`${BASE}/seen`)
  },
}
