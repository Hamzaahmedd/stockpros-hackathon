// src/config.ts
export const API_URL = import.meta.env.VITE_API_URL;
export const HEALTH_CHECK_URL = import.meta.env.VITE_HEALTH_CHECK_URL;
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Must be set explicitly per environment (e.g. APP_ENV=production in Render's
// env vars) — unlike Vite's own import.meta.env.MODE, this does not auto-switch
// based on `vite dev` vs `vite build`.
export const APP_ENV = import.meta.env.APP_ENV;
export const IS_PRODUCTION = APP_ENV === "production";

// Only ever enabled in production, even if a key is present in a dev/test
// .env — analytics should never fire from a developer's machine or CI.
export const POSTHOG_KEY = IS_PRODUCTION ? import.meta.env.VITE_POSTHOG_KEY : undefined;
export const POSTHOG_HOST =
  import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";