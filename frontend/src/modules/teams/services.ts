import api from "@/shared/api/axios";
import { UNEXPECTED_RESPONSE_MESSAGE, unwrapEnvelope } from "@/shared/api/envelope";
import { isRecord } from "@/shared/utils/type-guards";
import type { DomainAuthPolicy } from "@/modules/auth/types";
import type {
  AuditLogPage,
  DomainAuthPolicyResult,
  DomainVerification,
  InvitableRole,
  InviteResult,
  JoinOption,
  JoinRequest,
  JoinRequestResult,
  MyJoinRequest,
  PaidActionResult,
  PendingInvite,
  PreferencesPatch,
  PreferencesView,
  ResearchNote,
  SeatReduction,
  SharedScreener,
  SharedWatchlist,
  Team,
  TeamAnalytics,
  TeamJoinPolicy,
  TeamMember,
  TeamReceipt,
  TeamRole,
  TeamTransactionsPage,
  WorkspaceSearchResults,
} from "./types";

const BASE = "/api/v1/teams";

// Backend envelope: { success, message, data?, ...extra }. Read helpers unwrap `data`.
const unwrap = unwrapEnvelope;

/** Payment Mode answers with a checkout URL; Bypass Mode with the applied result. Both are read with checks. */
const readPaidAction = (body: unknown): PaidActionResult => {
  if (!isRecord(body)) throw new Error(UNEXPECTED_RESPONSE_MESSAGE);
  const data = isRecord(body.data) ? body.data : {};
  return {
    checkoutUrl: typeof body.checkoutUrl === "string" ? body.checkoutUrl : undefined,
    teamId: typeof data.teamId === "string" ? data.teamId : undefined,
    seatCapacity: typeof data.seatCapacity === "number" ? data.seatCapacity : undefined,
  };
};

export const teamService = {
  getMyTeam: async (): Promise<Team> => unwrap(await api.get(`${BASE}/me`)),

  listMembers: async (): Promise<TeamMember[]> =>
    unwrap(await api.get(`${BASE}/members`)),

  /** Payment Mode: `checkoutUrl` to redirect to. Bypass Mode: the team exists immediately. */
  createTeam: async (name: string, seatCount: number): Promise<PaidActionResult> => {
    const res = await api.post(BASE, { name, seatCount });
    return readPaidAction(res.data);
  },

  addSeats: async (seatCount: number): Promise<PaidActionResult> => {
    const res = await api.post(`${BASE}/seats/add`, { seatCount });
    return readPaidAction(res.data);
  },

  createInvite: async (
    email: string,
    role: InvitableRole,
  ): Promise<InviteResult> => unwrap(await api.post(`${BASE}/invites`, { email, role })),

  acceptInvite: async (token: string): Promise<{ teamId: string; role: TeamRole }> =>
    unwrap(await api.post(`${BASE}/invites/accept`, { token })),

  removeMember: async (userId: string): Promise<void> => {
    await api.delete(`${BASE}/members/${userId}`);
  },

  setMemberCreditLimit: async (
    userId: string,
    monthlyCreditLimitPaisa: number | null,
  ): Promise<void> => {
    await api.patch(`${BASE}/members/${userId}/credit-limit`, {
      monthlyCreditLimitPaisa,
    });
  },

  addDomain: async (
    domain: string,
    restrictOrgCreation: boolean,
  ): Promise<DomainVerification> =>
    unwrap(await api.post(`${BASE}/domains`, { domain, restrictOrgCreation })),

  verifyDomain: async (domain: string): Promise<DomainVerification> =>
    unwrap(await api.post(`${BASE}/domains/verify`, { domain })),

  setDomainJoinPolicy: async (
    domain: string,
    joinPolicy: TeamJoinPolicy,
  ): Promise<void> => {
    await api.patch(`${BASE}/domains/${encodeURIComponent(domain)}/join-policy`, {
      joinPolicy,
    });
  },

  /** Owner only. A stricter policy must carry `confirmDomain` (the lockout safeguard). */
  setDomainAuthPolicy: async (
    domain: string,
    authPolicy: DomainAuthPolicy,
    confirmDomain?: string,
  ): Promise<DomainAuthPolicyResult> =>
    unwrap(
      await api.patch(`${BASE}/domains/${encodeURIComponent(domain)}/auth-policy`, {
        authPolicy,
        confirmDomain,
      }),
    ),

  updateInstructions: async (orgInstructions: string | null): Promise<void> => {
    await api.patch(`${BASE}/instructions`, { orgInstructions });
  },

  getAnalytics: async (): Promise<TeamAnalytics> =>
    unwrap(await api.get(`${BASE}/analytics`)),

  getPreferences: async (): Promise<PreferencesView> =>
    unwrap(await api.get(`${BASE}/preferences`)),

  updateMyPreferences: async (patch: PreferencesPatch): Promise<PreferencesView> =>
    unwrap(await api.patch(`${BASE}/preferences`, patch)),

  updateWorkspacePreferences: async (
    patch: PreferencesPatch,
  ): Promise<PreferencesView> =>
    unwrap(await api.patch(`${BASE}/preferences/workspace`, patch)),

  search: async (q: string): Promise<WorkspaceSearchResults> =>
    unwrap(await api.get(`${BASE}/search`, { params: { q } })),

  // ─── Roles, ownership & membership ──────────────────────────────────────────
  changeMemberRole: async (userId: string, role: InvitableRole): Promise<void> => {
    await api.patch(`${BASE}/members/${userId}/role`, { role });
  },

  transferOwnership: async (userId: string): Promise<void> => {
    await api.post(`${BASE}/ownership/transfer`, { userId });
  },

  leave: async (): Promise<void> => {
    await api.post(`${BASE}/leave`);
  },

  listInvites: async (): Promise<PendingInvite[]> => {
    const invites = unwrap<PendingInvite[]>(await api.get(`${BASE}/invites`));
    return Array.isArray(invites) ? invites : [];
  },

  revokeInvite: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/invites/${id}`);
  },

  resendInvite: async (id: string): Promise<InviteResult> =>
    unwrap(await api.post(`${BASE}/invites/${id}/resend`)),

  // ─── Request to join ────────────────────────────────────────────────────────
  listJoinOptions: async (): Promise<JoinOption[]> => {
    const options = unwrap<JoinOption[]>(await api.get(`${BASE}/join-options`));
    return Array.isArray(options) ? options : [];
  },

  getMyJoinRequest: async (): Promise<MyJoinRequest | null> =>
    unwrap<MyJoinRequest | null>(await api.get(`${BASE}/join-requests/me`)) ?? null,

  requestToJoin: async (teamId: string): Promise<JoinRequestResult> =>
    unwrap(await api.post(`${BASE}/join-requests`, { teamId })),

  cancelMyJoinRequest: async (): Promise<void> => {
    await api.delete(`${BASE}/join-requests/me`);
  },

  listJoinRequests: async (): Promise<JoinRequest[]> => {
    const requests = unwrap<JoinRequest[]>(await api.get(`${BASE}/join-requests`));
    return Array.isArray(requests) ? requests : [];
  },

  approveJoinRequest: async (id: string): Promise<void> => {
    await api.post(`${BASE}/join-requests/${id}/approve`);
  },

  declineJoinRequest: async (id: string): Promise<void> => {
    await api.post(`${BASE}/join-requests/${id}/decline`);
  },

  // ─── Workspace lifecycle ────────────────────────────────────────────────────
  rename: async (name: string): Promise<void> => {
    await api.patch(BASE, { name });
  },

  deleteWorkspace: async (confirmName: string): Promise<void> => {
    await api.delete(BASE, { data: { confirmName } });
  },

  /** The owner's JSON snapshot, as a Blob to save. */
  exportWorkspace: async (): Promise<Blob> => {
    const res = await api.get(`${BASE}/export`, { responseType: "blob" });
    return res.data;
  },

  // ─── Billing admin ──────────────────────────────────────────────────────────
  updateBillingContact: async (billingEmail: string | null): Promise<void> => {
    await api.patch(`${BASE}/billing-contact`, { billingEmail });
  },

  scheduleSeatReduction: async (seatCount: number): Promise<SeatReduction> =>
    unwrap(await api.post(`${BASE}/seats/reduce`, { seatCount })),

  cancelSeatReduction: async (): Promise<SeatReduction> =>
    unwrap(await api.delete(`${BASE}/seats/reduce`)),

  listTransactions: async (cursor?: string): Promise<TeamTransactionsPage> =>
    unwrap(
      await api.get("/api/v1/payments/team/transactions", {
        params: cursor ? { cursor } : undefined,
      }),
    ),

  getReceipt: async (id: string): Promise<TeamReceipt> =>
    unwrap(await api.get(`/api/v1/payments/team/transactions/${id}/receipt`)),

  // ─── Audit log ──────────────────────────────────────────────────────────────
  listAuditLog: async (cursor?: string): Promise<AuditLogPage> =>
    unwrap(
      await api.get(`${BASE}/audit-log`, { params: cursor ? { cursor } : undefined }),
    ),

  // ─── Shared assets ──────────────────────────────────────────────────────────
  listWatchlists: async (): Promise<SharedWatchlist[]> =>
    unwrap(await api.get(`${BASE}/watchlists`)),
  createWatchlist: async (name: string, symbols: string[]): Promise<SharedWatchlist> =>
    unwrap(await api.post(`${BASE}/watchlists`, { name, symbols })),
  deleteWatchlist: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/watchlists/${id}`);
  },

  listScreeners: async (): Promise<SharedScreener[]> =>
    unwrap(await api.get(`${BASE}/screeners`)),
  createScreener: async (
    name: string,
    criteria: Record<string, unknown>,
  ): Promise<SharedScreener> =>
    unwrap(await api.post(`${BASE}/screeners`, { name, criteria })),
  deleteScreener: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/screeners/${id}`);
  },

  listNotes: async (symbol?: string): Promise<ResearchNote[]> =>
    unwrap(await api.get(`${BASE}/notes`, { params: symbol ? { symbol } : undefined })),
  createNote: async (symbol: string, content: string): Promise<ResearchNote> =>
    unwrap(await api.post(`${BASE}/notes`, { symbol, content })),
  deleteNote: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/notes/${id}`);
  },
};
