/**
 * Pakistan Standard Time (PKT, UTC+5) date formatting helpers.
 *
 * Instead of monkey-patching Date.prototype (which is a global side-effect),
 * we expose three composable helpers that always output PKT dates.
 * Callers that need a different timezone can pass their own `options.timeZone`.
 */

export const PKT_TIMEZONE = "Asia/Karachi";

/**
 * Format a date as a localised date string (e.g. "07/09/2026") in PKT.
 * Accepts any value accepted by `new Date()`.
 */
export function formatDate(
  date: Date | string | number,
  locales: Intl.LocalesArgument = "en-PK",
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Date(date).toLocaleDateString(locales, {
    ...options,
    timeZone: options.timeZone ?? PKT_TIMEZONE,
  });
}

/**
 * Format a date as a localised date-time string in PKT.
 */
export function formatDateTime(
  date: Date | string | number,
  locales: Intl.LocalesArgument = "en-PK",
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Date(date).toLocaleString(locales, {
    ...options,
    timeZone: options.timeZone ?? PKT_TIMEZONE,
  });
}

/**
 * Format a date as a localised time string in PKT.
 */
export function formatTime(
  date: Date | string | number,
  locales: Intl.LocalesArgument = "en-PK",
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Date(date).toLocaleTimeString(locales, {
    ...options,
    timeZone: options.timeZone ?? PKT_TIMEZONE,
  });
}
