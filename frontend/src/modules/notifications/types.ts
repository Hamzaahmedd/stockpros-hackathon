export interface Notification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export type PaginatedNotificationsResult = {
  data: Notification[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
};

export interface NotificationSummary {
  unreadCount: number;
}