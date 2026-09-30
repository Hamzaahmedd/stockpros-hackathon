import api from "@/shared/api/axios";
import { UNEXPECTED_RESPONSE_MESSAGE, unwrapEnvelope } from "@/shared/api/envelope";
import { isRecord } from "@/shared/utils/type-guards";
import type {
  DomainVerification,
  InvitableRole,
  InviteResult,
  PaidActionResult,
  PreferencesPatch,
  PreferencesView,
  ResearchNote,
  SharedScreener,
  SharedWatchlist,
  Team,
  TeamAnalytics,
  TeamMember,
  TeamRole,
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
