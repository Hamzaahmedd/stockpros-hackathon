import type { DomainAuthPolicy } from "@/modules/auth/types";

export type TeamRole = "OWNER" | "ADMIN" | "MEMBER";

export type TeamStatus = "ACTIVE" | "CANCELLED";

/** Roles that can be handed out by invitation (the owner is whoever created the workspace). */
export type InvitableRole = Exclude<TeamRole, "OWNER">;

export type SeatUtilization = {
  capacity: number;
  /** Seat count the next renewal bills (a scheduled reduction); invites are already limited to it. */
  scheduledCapacity: number | null;
  active: number;
  pendingInvites: number;
  available: number;
};

/** What a verified domain lets colleagues do. Mirrors the backend `TeamJoinPolicy` enum. */
export enum TeamJoinPolicy {
  INVITE_ONLY = "INVITE_ONLY",
  REQUEST_APPROVAL = "REQUEST_APPROVAL",
  AUTO_APPROVE = "AUTO_APPROVE",
}

/** Mirrors the backend `JoinRequestStatus` enum. */
export enum JoinRequestStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  DECLINED = "DECLINED",
  CANCELLED = "CANCELLED",
}

export type TeamDomain = {
  id: string;
  domain: string;
  isVerified: boolean;
  restrictOrgCreation: boolean;
  joinPolicy: TeamJoinPolicy;
  authPolicy: DomainAuthPolicy;
};

/** Result of changing a domain's sign-in policy; `revokedSessions` is how many sessions were signed out. */
export type DomainAuthPolicyResult = TeamDomain & { revokedSessions: number };

/** A workspace the caller's verified email domain lets them join (never INVITE_ONLY). */
export type JoinOption = {
  teamId: string;
  teamName: string;
  domain: string;
  joinPolicy: Exclude<TeamJoinPolicy, TeamJoinPolicy.INVITE_ONLY>;
};

export type MyJoinRequest = {
  id: string;
  teamId: string;
  teamName: string;
  status: JoinRequestStatus.PENDING;
  createdAt: string;
};

/** `APPROVED` means the caller joined at once (auto-approve domain). */
export type JoinRequestResult = {
  teamId: string;
  status: JoinRequestStatus.PENDING | JoinRequestStatus.APPROVED;
};

/** A pending request as an owner/admin sees it. */
export type JoinRequest = {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  status: JoinRequestStatus;
  createdAt: string;
};

export type TeamSubscription = {
  status: "ACTIVE" | "GRACE" | "EXPIRED" | "CANCELLED";
  autoRenew: boolean;
  currentPeriodEnd: string | null;
  gracePeriodEnd: string | null;
} | null;

export type Team = {
  id: string;
  name: string;
  status: TeamStatus;
  role: TeamRole;
  seats: SeatUtilization;
  creditBalanceInPaisa: number;
  orgInstructions: string | null;
  /** Owners/admins only; null when unset (receipts then go to the owner). */
  billingEmail: string | null;
  domains: TeamDomain[];
  subscription: TeamSubscription;
};

export type TeamMember = {
  userId: string;
  displayName: string;
  role: TeamRole;
  joinedAt: string;
  /** Owners/admins only. */
  email?: string;
  /** Owners/admins only; null = no cap. */
  monthlyCreditLimitPaisa?: number | null;
};

export type InviteResult = {
  invite: { id: string; email: string; role: TeamRole; expiresAt: string };
  inviteLink: string;
  /** False when the email could not be queued (the link still works). */
  emailQueued: boolean;
};

export type DomainVerification = {
  id: string;
  domain: string;
  isVerified: boolean;
  restrictOrgCreation: boolean;
  verification: { recordType: "TXT"; recordName: string; recordValue: string };
};

/** Payment Mode returns a checkout to redirect to; Bypass Mode applies the change at once. */
export type PaidActionResult = {
  checkoutUrl?: string;
  teamId?: string;
  seatCapacity?: number;
};

export type SharedWatchlist = {
  id: string;
  name: string;
  symbols: string[];
  createdBy: string;
  createdAt: string;
};

export type SharedScreener = {
  id: string;
  name: string;
  criteria: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
};

export type ResearchNote = {
  id: string;
  symbol: string;
  content: string;
  authorId: string;
  createdAt: string;
};

export type TeamAnalytics = {
  windowStart: string;
  totalsByFeature: Record<string, number>;
  perMember: {
    userId: string;
    displayName: string;
    role: TeamRole;
    usageByFeature: Record<string, number>;
    creditSpentPaisa: number;
    monthlyCreditLimitPaisa: number | null;
  }[];
  topSymbols: { symbol: string | null; count: number }[];
  activeTickers: string[];
};

export type PreferenceTheme = "LIGHT" | "DARK" | "SYSTEM";
export type ChartLayout = "SINGLE" | "SPLIT" | "GRID";

/** A stored preference set; an absent field means "use the default". */
export type Preferences = {
  theme?: PreferenceTheme;
  chartLayout?: ChartLayout;
  indicators?: string[];
};

/** A PATCH: set a field, omit to keep it, or send `null` to clear it back to the default. */
export type PreferencesPatch = {
  [K in keyof Preferences]?: Preferences[K] | null;
};

export type PreferencesView = {
  workspace: Preferences;
  personal: Preferences;
  /** Workspace defaults overlaid by the caller's own preferences. */
  effective: Preferences;
};

export type WorkspaceSearchResults = {
  watchlists: SharedWatchlist[];
  screeners: SharedScreener[];
  notes: ResearchNote[];
  forecasts: {
    id: string;
    symbol: string;
    marketDecision: string;
    portfolioDecision: string;
    confidence: number;
    run: { id: string; userId: string; runAt: string };
  }[];
};

export type PendingInvite = {
  id: string;
  email: string;
  role: InvitableRole;
  expiresAt: string;
  createdAt: string;
};

export type SeatReduction = {
  seatCapacity: number;
  scheduledSeatCapacity: number | null;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  actorUserId: string | null;
  /** Current display name; null for system actions or deleted users. */
  actorName: string | null;
  targetUserId: string | null;
  targetName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditLogPage = {
  entries: AuditLogEntry[];
  nextCursor: string | null;
};

export type TeamTransaction = {
  id: string;
  referenceNumber: string;
  kind: "SUBSCRIPTION" | "SEAT_ADDITION" | "TOPUP";
  description: string;
  status: "COMPLETED" | "REFUNDED";
  amountPaisa: number;
  currency: string;
  seatCount: number;
  createdAt: string;
};

export type TeamTransactionsPage = {
  entries: TeamTransaction[];
  nextCursor: string | null;
};

export type TeamReceipt = Omit<TeamTransaction, "createdAt"> & {
  /** Per-seat price; null for credit top-ups. */
  unitPricePaisa: number | null;
  paymentMethod: string | null;
  paidAt: string;
  teamName: string;
  /** The billing contact, or the owner's email when none is set. */
  billedTo: string;
};
