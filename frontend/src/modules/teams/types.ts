export type TeamRole = "OWNER" | "ADMIN" | "MEMBER";

export type TeamStatus = "ACTIVE" | "CANCELLED";

/** Roles that can be handed out by invitation (the owner is whoever created the workspace). */
export type InvitableRole = Exclude<TeamRole, "OWNER">;

export type SeatUtilization = {
  capacity: number;
  active: number;
  pendingInvites: number;
  available: number;
};

export type TeamDomain = {
  id: string;
  domain: string;
  isVerified: boolean;
  restrictOrgCreation: boolean;
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
