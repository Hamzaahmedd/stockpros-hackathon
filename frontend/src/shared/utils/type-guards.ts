/** True for a plain JSON-style object (not null, not an array). Narrows `unknown` without a cast. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** `value` if it is a non-empty string, otherwise undefined. */
export const asNonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined
