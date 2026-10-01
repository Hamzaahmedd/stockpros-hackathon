import type { PlatformRole } from "@/modules/auth/types";
import {
  ADMIN_MIN_REASON_LENGTH,
  PLATFORM_ROLE_RANK,
  STAFF_ROLES,
  TICKET_REF_PATTERN,
} from "./constants";

export { apiErrorMessage } from "@/shared/utils/api-error";
export { formatPaisa } from "@/modules/plans/utils";

/** True when `actual` meets or exceeds `required`. The UI only hides controls; the API enforces every one. */
export const hasPlatformRole = (
  actual: PlatformRole | undefined,
  required: PlatformRole,
): boolean => PLATFORM_ROLE_RANK[actual ?? "USER"] >= PLATFORM_ROLE_RANK[required];

/** Any role above plain USER; the one place that decides who gets staff navigation and routes. */
export const isStaffRole = (role: PlatformRole | undefined): boolean =>
  STAFF_ROLES.includes(role ?? "USER");

export const isValidReason = (reason: string): boolean =>
  reason.trim().length >= ADMIN_MIN_REASON_LENGTH;

/** A blank ticket field is fine (the API decides whether one is required); anything typed must be well formed. */
export const isValidTicketRef = (value: string): boolean =>
  value.trim() === "" || TICKET_REF_PATTERN.test(value.trim());

export const formatDateTime = (value: string | null): string =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

/** "SEAT_CAPACITY_OVERRIDE" -> "Seat capacity override". */
export const actionLabel = (action: string): string => {
  const words = action.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};
