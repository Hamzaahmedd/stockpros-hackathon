export interface Notification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export const MARKET_INTEREST_OPTIONS = [
  "ai_tech",
  "energy",
  "finance",
  "healthcare",
  "growth",
  "consumer",
] as const;

export type MarketInterest = (typeof MARKET_INTEREST_OPTIONS)[number];

export interface NotificationPreferences {
  marketInterests: MarketInterest[];
  inAppAlertsEnabled: boolean;
  emailVolatilityAlertsEnabled: boolean;
  dailyDigestEnabled: boolean;
}

export type PaginatedNotificationsResult = {
  data: Notification[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
};
