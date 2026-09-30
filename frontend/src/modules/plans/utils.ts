import type { PlanTier } from "../auth/types";

/** PRO and TEAM both unlock the full paid feature set (mirrors backend `hasPaidPlan`). */
export const isPaidPlan = (plan: PlanTier | undefined): boolean =>
  plan === "PRO" || plan === "TEAM";

/** Formats integer paisa as rupees, e.g. 749900 -> "Rs 7,499". */
export const formatPaisa = (paisa: number): string =>
  `Rs ${(paisa / 100).toLocaleString("en-PK")}`;

/** Clamps free-typed seat input into the allowed range (NaN falls back to the minimum). */
export const clampSeats = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : min;
