/**
 * Keeps a team-invite token alive across the login / onboarding round trip.
 *
 * Primary store is `sessionStorage` (`pending_invite_token`). Sign-in is
 * passwordless, and a magic link normally opens in a *new tab*, where
 * sessionStorage is empty — so a short-lived `localStorage` copy is kept as a
 * fallback for that case. Every storage call is guarded: storage can throw
 * (private mode, blocked site data) and the app must still work without it.
 */
import { isRecord } from "@/shared/utils/type-guards";

export const PENDING_INVITE_STORAGE_KEY = "pending_invite_token";

/** Fallback copy lives at most a day — well inside the 7-day invite lifetime, but not forever. */
export const PENDING_INVITE_FALLBACK_TTL_MS = 24 * 60 * 60 * 1000;

type FallbackRecord = { token: string; expiresAt: number };

const safely = <T>(fn: () => T): T | undefined => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};

export const setPendingInviteToken = (token: string): void => {
  safely(() => sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, token));
  const record: FallbackRecord = {
    token,
    expiresAt: Date.now() + PENDING_INVITE_FALLBACK_TTL_MS,
  };
  safely(() =>
    localStorage.setItem(PENDING_INVITE_STORAGE_KEY, JSON.stringify(record)),
  );
};

/** A stored record is only trusted if it has the exact shape we wrote — storage can hold anything. */
const parseFallbackRecord = (raw: string): FallbackRecord | null => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !isRecord(value) ||
    typeof value.token !== "string" ||
    typeof value.expiresAt !== "number"
  ) {
    return null;
  }
  return { token: value.token, expiresAt: value.expiresAt };
};

const readFallback = (): string | null => {
  const raw = safely(() => localStorage.getItem(PENDING_INVITE_STORAGE_KEY));
  if (!raw) return null;
  const record = parseFallbackRecord(raw);
  if (record && record.expiresAt > Date.now()) return record.token;
  // Corrupt, mistyped or expired: treated as absent and cleaned up.
  safely(() => localStorage.removeItem(PENDING_INVITE_STORAGE_KEY));
  return null;
};

export const getPendingInviteToken = (): string | null =>
  safely(() => sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY)) ??
  readFallback();

export const clearPendingInviteToken = (): void => {
  safely(() => sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY));
  safely(() => localStorage.removeItem(PENDING_INVITE_STORAGE_KEY));
};

/** Routes that render the invite landing page (the emailed link, plus the API-shaped alias). */
export const INVITE_ROUTES = ["/teams/invite", "/teams/invites/accept"] as const;

/** Pages where a user is mid-authentication; the pending invite is left alone there. */
const isAuthFlowPath = (pathname: string): boolean =>
  pathname === "/login" ||
  pathname.startsWith("/auth/") ||
  INVITE_ROUTES.some((route) => pathname === route);

/**
 * Whether the pending invite should be auto-accepted now: someone is fully
 * signed in and is no longer inside login / onboarding / phone-verification.
 */
export const shouldAcceptPendingInvite = (
  pathname: string,
  isSignedIn: boolean,
): boolean => isSignedIn && !isAuthFlowPath(pathname);
