import api from '@/shared/api/axios';
import type { NotificationSummary, PaginatedNotificationsResult } from './types';

export const notificationService = {
  getSummary: async (): Promise<NotificationSummary> => {
    const res = await api.get('/api/v1/notifications/summary');
    return res.data?.data || { unreadCount: 0 };
  },

  getNotifications: async (cursor?: string): Promise<PaginatedNotificationsResult> => {
    const res = await api.get('/api/v1/notifications', { params: { cursor } });
    // Support both old array response and new paginated envelope
    if (Array.isArray(res.data?.data)) {
      return {
        data: res.data.data,
        nextCursor: res.data.extra?.nextCursor ?? null,
        hasMore: res.data.extra?.hasMore ?? false,
        total: res.data.extra?.total ?? 0,
      };
    }
    return { data: [], nextCursor: null, hasMore: false, total: 0 };
  },

  markRead: async (id: string) => {
    await api.patch(`/api/v1/notifications/${id}/read`);
  },

  markAllRead: async () => {
    await api.patch('/api/v1/notifications/read-all');
  },

  markMultipleRead: async (notificationIds: string[]) => {
    await api.patch('/api/v1/notifications/read-multiple', { notificationIds });
  },

  deleteNotification: async (id: string) => {
    await api.delete(`/api/v1/notifications/${id}`);
  }
};
