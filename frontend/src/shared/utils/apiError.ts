import type { AxiosError } from "axios";

/**
 * Extracts the error message from an axios API error response, falling back
 * to the provided default when no message is present.
 */
export const getApiErrorMessage = (err: unknown, fallback: string): string => {
  const data = (err as AxiosError<{ message?: string }> | null | undefined)?.response?.data;
  return typeof data?.message === "string" && data.message ? data.message : fallback;
};
