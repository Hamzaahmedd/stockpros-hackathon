import type { DomainAuthPolicy, PlanTier, PlatformRole } from "@/modules/auth/types";
import type { ADMIN_AUDIT_ACTIONS, CREDIT_LEDGER_TYPES, PAYMENT_STATUSES } from "./constants";

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminUser {
  id: string;
  displayName: string | null;
  email: string;
  status: string;
  plan: PlanTier;
  platformRole: PlatformRole;
  creditBalanceInPaisa: number;
  activeSessions: number;
  deletedAt: string | null;
  /** True when the API masked email/name; a Reveal (audited) shows the real values. */
  piiMasked: boolean;
  subscription: {
    id: string;
    planTier: PlanTier;
    status: string;
    autoRenew: boolean;
    currentPeriodEnd: string | null;
    gracePeriodEnd: string | null;
  } | null;
  team: { teamId: string; role: string } | null;
}

export interface AdminTeam {
  id: string;
  name: string;
  status: string;
  seatCapacity: number;
  scheduledSeatCapacity: number | null;
  effectiveSeatCapacity: number;
  seatsUsed: number;
  seatUtilization: string;
  piiMasked: boolean;
  orgInstructions: string | null;
  creditBalanceInPaisa: number;
  owner: { id: string; displayName: string | null; email: string };
  /** `authPolicy` is absent until the search payload exposes it. */
  domains: { id: string; domain: string; isVerified: boolean; authPolicy?: DomainAuthPolicy }[];
  members: { role: string; user: { id: string; displayName: string | null; email: string } }[];
  subscription: { id: string; status: string; currentPeriodEnd: string | null } | null;
}

export interface AdminWebhook {
  id: string;
  userId: string;
  teamId: string | null;
  trackerId: string;
  status: PaymentStatus;
  kind: string;
  planTier: PlanTier;
  amountPaisa: number;
  paymentMethod: string | null;
  webhookReceived: boolean;
  signatureVerified: boolean;
  payload: unknown;
  createdAt: string;
}

export type CreditLedgerType = (typeof CREDIT_LEDGER_TYPES)[number];

export interface CreditLedgerEntry {
  id: string;
  userId: string | null;
  teamId: string | null;
  amountPaisa: number;
  type: CreditLedgerType;
  description: string;
  createdAt: string;
}

export type AdminQueueHealth =
  | { name: string; available: false }
  | {
      name: string;
      available: true;
      counts: Record<string, number>;
      recentFailures: {
        id: string | null;
        name: string;
        attemptsMade: number;
        failedReason: string;
        failedAt: string | null;
      }[];
    };

export interface TimelineEvent {
  id: string;
  type: "PAYMENT" | "CREDIT" | "SESSION" | "TEAM" | "STAFF_ACTION";
  title: string;
  detail: string | null;
  ticketRef: string | null;
  at: string;
}

export interface TimelinePage {
  items: TimelineEvent[];
  nextBefore: string | null;
}

export interface RevealedUser {
  id: string;
  email: string;
  displayName: string | null;
  phoneNumber: string | null;
}

export interface AdminAuditEntry {
  id: string;
  action: AdminAuditAction;
  targetType: string;
  targetId: string;
  reason: string;
  ticketRef: string | null;
  ipAddress: string | null;
  createdAt: string;
  admin: { id: string; displayName: string | null };
}

export interface CreditLedgerFilters {
  userId?: string;
  teamId?: string;
  type?: CreditLedgerType;
}

export interface WebhookFilters {
  status?: PaymentStatus;
  trackerId?: string;
}

export interface AuditFilters {
  action?: AdminAuditAction;
  targetId?: string;
  ticketRef?: string;
}
