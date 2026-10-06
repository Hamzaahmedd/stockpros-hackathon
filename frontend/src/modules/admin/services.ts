import type { PlanTier } from '@/modules/auth/types'
import api from '@/shared/api/axios'
import { unwrapEnvelope } from '@/shared/api/envelope'
import type { CreditTarget } from './constants'
import type {
  TimelinePage,
  RevealedUser,
  AdminAuditEntry,
  AdminPage,
  AdminQueueHealth,
  AdminTeam,
  CreditLedgerEntry,
  AdminUser,
  AdminWebhook,
  AuditFilters,
  CreditLedgerFilters,
  WebhookFilters,
} from './types'

const BASE = '/api/v1/admin'
const unwrap = unwrapEnvelope

/** Drops empty filter values so they are not sent as blank query params. */
const compact = (params: object): Record<string, string | number> =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  )

export const adminService = {
  // Step-up verification
  requestStepUp: async (): Promise<void> => {
    await api.post(`${BASE}/step-up/request`, {})
  },
  verifyStepUp: async (code: string): Promise<void> => {
    await api.post(`${BASE}/step-up/verify`, { code })
  },

  // Users
  searchUsers: async (q: string): Promise<AdminUser[]> =>
    unwrap(await api.get(`${BASE}/users/search`, { params: { q } })),
  overridePlan: async (
    userId: string,
    plan: PlanTier,
    reason: string,
    ticketRef?: string,
  ): Promise<void> => {
    await api.post(`${BASE}/users/${userId}/plan-override`, {
      plan,
      reason,
      ticketRef,
    })
  },
  getTimeline: async (userId: string, before?: string): Promise<TimelinePage> =>
    unwrap(
      await api.get(`${BASE}/users/${userId}/timeline`, {
        params: compact({ before }),
      }),
    ),
  revealUser: async (
    userId: string,
    reason: string,
    ticketRef?: string,
  ): Promise<RevealedUser> =>
    unwrap(
      await api.post(`${BASE}/users/${userId}/reveal`, { reason, ticketRef }),
    ),
  invalidateSessions: async (
    userId: string,
    reason: string,
    ticketRef?: string,
  ): Promise<void> => {
    await api.post(`${BASE}/users/${userId}/sessions/invalidate`, {
      reason,
      ticketRef,
    })
  },

  // Teams
  searchTeams: async (q: string): Promise<AdminTeam[]> =>
    unwrap(await api.get(`${BASE}/teams/search`, { params: { q } })),
  setSeatCapacity: async (
    teamId: string,
    seatCapacity: number,
    reason: string,
    ticketRef?: string,
  ): Promise<void> => {
    await api.patch(`${BASE}/teams/${teamId}/capacity`, {
      seatCapacity,
      reason,
      ticketRef,
    })
  },
  verifyDomain: async (
    domainId: string,
    reason: string,
    ticketRef?: string,
  ): Promise<void> => {
    await api.post(`${BASE}/teams/domains/${domainId}/verify`, {
      reason,
      ticketRef,
    })
  },
  resetDomainAuthPolicy: async (
    domain: string,
    reason: string,
    ticketRef?: string,
  ): Promise<void> => {
    await api.post(
      `${BASE}/teams/domains/${encodeURIComponent(domain)}/reset-auth-policy`,
      {
        reason,
        ticketRef,
      },
    )
  },
  removeMember: async (
    userId: string,
    reason: string,
    ticketRef?: string,
  ): Promise<void> => {
    await api.delete(`${BASE}/teams/members/${userId}`, {
      data: { reason, ticketRef },
    })
  },

  // Billing
  listWebhooks: async (
    filters: WebhookFilters,
    page: number,
  ): Promise<AdminPage<AdminWebhook>> =>
    unwrap(
      await api.get(`${BASE}/billing/webhooks`, {
        params: compact({ ...filters, page }),
      }),
    ),
  retryWebhook: async (
    transactionId: string,
    reason: string,
    ticketRef?: string,
  ): Promise<void> => {
    await api.post(`${BASE}/billing/webhooks/${transactionId}/retry`, {
      reason,
      ticketRef,
    })
  },
  adjustCredits: async (input: {
    target: CreditTarget
    targetId: string
    amountPaisa: number
    reason: string
    ticketRef?: string
  }): Promise<void> => {
    await api.post(`${BASE}/billing/credits/adjust`, input)
  },
  extendSubscription: async (
    subscriptionId: string,
    input: {
      currentPeriodEnd?: string
      gracePeriodEnd?: string
      reason: string
      ticketRef?: string
    },
  ): Promise<void> => {
    await api.post(`${BASE}/subscriptions/${subscriptionId}/extend`, input)
  },

  listCreditLedger: async (
    filters: CreditLedgerFilters,
    page: number,
  ): Promise<AdminPage<CreditLedgerEntry>> =>
    unwrap(
      await api.get(`${BASE}/billing/credit-ledger`, {
        params: compact({ ...filters, page }),
      }),
    ),

  // System health
  getQueueHealth: async (): Promise<AdminQueueHealth[]> =>
    unwrap(await api.get(`${BASE}/telemetry/queues`)),

  // System
  getMarketStatus: async (): Promise<{ emergencyClosed: boolean }> =>
    unwrap(await api.get(`${BASE}/system/market-status`)),
  setMarketEmergency: async (
    closed: boolean,
    reason: string,
    ticketRef?: string,
  ): Promise<void> => {
    await api.post(`${BASE}/system/market-emergency`, {
      closed,
      reason,
      ticketRef,
    })
  },
  listAuditLogs: async (
    filters: AuditFilters,
    page: number,
  ): Promise<AdminPage<AdminAuditEntry>> =>
    unwrap(
      await api.get(`${BASE}/system/audit-logs`, {
        params: compact({ ...filters, page }),
      }),
    ),
}
