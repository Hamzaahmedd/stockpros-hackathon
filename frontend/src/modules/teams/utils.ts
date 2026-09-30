import type {
  ChartLayout,
  InvitableRole,
  PreferenceTheme,
  TeamRole,
} from "./types";

/** Owners and admins manage the workspace; plain members get read access. */
export const isTeamAdmin = (role: TeamRole): boolean =>
  role === "OWNER" || role === "ADMIN";

export { apiErrorMessage } from "@/shared/utils/api-error";

export const PREFERENCE_THEMES: readonly PreferenceTheme[] = ["LIGHT", "DARK", "SYSTEM"];
export const CHART_LAYOUTS: readonly ChartLayout[] = ["SINGLE", "SPLIT", "GRID"];
export const INVITABLE_ROLES: readonly InvitableRole[] = ["MEMBER", "ADMIN"];

// A <select>'s value is just a string; these turn it back into the typed value
// by looking it up in the allowed list, so nothing has to be cast (and an
// unexpected value can never slip through).
export const parsePreferenceTheme = (value: string): PreferenceTheme | "" =>
  PREFERENCE_THEMES.find((theme) => theme === value) ?? "";

export const parseChartLayout = (value: string): ChartLayout | "" =>
  CHART_LAYOUTS.find((layout) => layout === value) ?? "";

export const parseInvitableRole = (value: string): InvitableRole | undefined =>
  INVITABLE_ROLES.find((role) => role === value);

export const formatDate = (value: string | null): string =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

/** Human label for a usage feature key returned by the analytics endpoint. */
export const FEATURE_LABELS: Record<string, string> = {
  ai_forecast: "AI forecasts",
  ai_decision: "Decision support",
  search: "Searches",
};

export const featureLabel = (feature: string): string =>
  FEATURE_LABELS[feature] ?? feature;

const MAX_INDICATORS = 20;
const MAX_INDICATOR_LENGTH = 40;

/**
 * Parses a comma-separated indicator list (blank entries dropped, duplicates
 * removed case-insensitively). Returns `null` when it breaks the backend's
 * limits (max 20 names, each 1–40 characters) so the UI can say so up front.
 */
export const parseIndicators = (input: string): string[] | null => {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const raw of input.split(",")) {
    const name = raw.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    if (name.length > MAX_INDICATOR_LENGTH) return null;
    seen.add(name.toLowerCase());
    list.push(name);
  }
  return list.length > MAX_INDICATORS ? null : list;
};

/** Maps a stored preference onto the app's two-value theme (SYSTEM follows the OS). */
export const toAppTheme = (theme: PreferenceTheme): "light" | "dark" => {
  if (theme === "LIGHT") return "light";
  if (theme === "DARK") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};
