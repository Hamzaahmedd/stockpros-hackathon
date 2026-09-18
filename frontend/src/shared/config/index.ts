// src/config.ts
export const API_URL = import.meta.env.VITE_API_URL;
export const HEALTH_CHECK_URL = import.meta.env.VITE_HEALTH_CHECK_URL;
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
export const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
export const POSTHOG_HOST =
  import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";