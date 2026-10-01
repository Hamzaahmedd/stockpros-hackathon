import type { PlanTier } from "@/modules/auth/types";
import api from "@/shared/api/axios";
import { unwrapEnvelope } from "@/shared/api/envelope";
import type { CreditTarget } from "./constants";
import type {
  AdminAuditEntry,
  AdminPage,
  AdminQueueHealth,
  AdminTeam,
  AdminUsageEvent,
  AdminUser,
  AdminWebhook,
  AuditFilters,
  UsageFilters,
  WebhookFilters,
} from "./types";

const BASE = "/api/v1/admin";
const unwrap = unwrapEnvelope;

/** Drops empty filter values so they are not sent as blank query params. */
const compact = (params: object): Record<string, string | number> =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ""),
  );

export const adminService = {
  // Users
  searchUsers: async (q: string): Promise<AdminUser[]> =>
    unwrap(await api.get(`${BASE}/users/search`, { params: { q } })),
  overridePlan: async (userId: string, plan: PlanTier, reason: string): Promise<void> => {
    await api.post(`${BASE}/users/${userId}/plan-override`, { plan, reason });
  },
  invalidateSessions: async (userId: string, reason: string): Promise<void> => {
    await api.post(`${BASE}/users/${userId}/sessions/invalidate`, { reason });
  },

  // Teams
  searchTeams: async (q: string): Promise<AdminTeam[]> =>
    unwrap(await api.get(`${BASE}/teams/search`, { params: { q } })),
  setSeatCapacity: async (teamId: string, seatCapacity: number, reason: string): Promise<void> => {
    await api.patch(`${BASE}/teams/${teamId}/capacity`, { seatCapacity, reason });
  },
  verifyDomain: async (domainId: string, reason: string): Promise<void> => {
    await api.post(`${BASE}/teams/domains/${domainId}/verify`, { reason });
  },
  removeMember: async (userId: string, reason: string): Promise<void> => {
    await api.delete(`${BASE}/teams/members/${userId}`, { data: { reason } });
  },

  // Billing
  listWebhooks: async (filters: WebhookFilters, page: number): Promise<AdminPage<AdminWebhook>> =>
    unwrap(await api.get(`${BASE}/billing/webhooks`, { params: compact({ ...filters, page }) })),
  retryWebhook: async (transactionId: string, reason: string): Promise<void> => {
    await api.post(`${BASE}/billing/webhooks/${transactionId}/retry`, { reason });
  },
  adjustCredits: async (input: {
    target: CreditTarget;
    targetId: string;
    amountPaisa: number;
    reason: string;
  }): Promise<void> => {
    await api.post(`${BASE}/billing/credits/adjust`, input);
  },
  extendSubscription: async (
    subscriptionId: string,
    input: { currentPeriodEnd?: string; gracePeriodEnd?: string; reason: string },
  ): Promise<void> => {
    await api.post(`${BASE}/subscriptions/${subscriptionId}/extend`, input);
  },

  // Telemetry
  searchUsage: async (filters: UsageFilters, page: number): Promise<AdminPage<AdminUsageEvent>> =>
    unwrap(await api.get(`${BASE}/telemetry/usage`, { params: compact({ ...filters, page }) })),
  getQueueHealth: async (): Promise<AdminQueueHealth[]> =>
    unwrap(await api.get(`${BASE}/telemetry/queues`)),

  // System
  getMarketStatus: async (): Promise<{ emergencyClosed: boolean }> =>
    unwrap(await api.get(`${BASE}/system/market-status`)),
  setMarketEmergency: async (closed: boolean, reason: string): Promise<void> => {
    await api.post(`${BASE}/system/market-emergency`, { closed, reason });
  },
  listAuditLogs: async (filters: AuditFilters, page: number): Promise<AdminPage<AdminAuditEntry>> =>
    unwrap(await api.get(`${BASE}/system/audit-logs`, { params: compact({ ...filters, page }) })),
};
