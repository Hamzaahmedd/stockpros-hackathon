import type { Page } from "@playwright/test";

/**
 * These smoke tests run against a built frontend with no backend running
 * (see e2e/README.md). On mount, useAuth's fetchMe() finds no stored access
 * token and calls POST /auth/refresh-token; only if THAT returns an
 * accessToken does it go on to call /auth/me and /rbac/user-screens.
 *
 * Mock refresh-token as a 200 with no accessToken — this is a genuine "not
 * logged in" response shape, not an error, so it resolves fetchMe straight to
 * setUser(null) without ever calling the other two endpoints, and without
 * the browser logging a "Failed to load resource" console error the way a
 * mocked 401 (or a real, unmocked connection failure) would.
 */
export const mockLoggedOut = async (page: Page): Promise<void> => {
  await page.route("**/api/v1/auth/refresh-token", (route) =>
    route.fulfill({ status: 200, json: {} }),
  );
};

/**
 * Minimal shape of the fields VerifyPhoneGuard / VerifyPhone actually read
 * off `user` (see frontend/src/modules/auth/types.ts `User`).
 */
export type MockUser = {
  userId?: string;
  email?: string;
  displayName?: string;
  phoneVerifiedAt?: string | null;
};

/**
 * Mocks a fully "logged in" session for useAuth's mount-time fetchMe():
 * refresh-token returns an accessToken, then /auth/me and
 * /rbac/user-screens resolve with the given user. No real backend is
 * contacted — same rationale as mockLoggedOut, extended to cover the
 * authenticated fetchMe branch (see e2e/README.md for why these two
 * requests only fire when refresh-token returns an accessToken).
 */
export const mockLoggedIn = async (
  page: Page,
  user: MockUser = { userId: "e2e-user-1", email: "e2e-user@example.com" },
): Promise<void> => {
  await page.route("**/api/v1/auth/refresh-token", (route) =>
    route.fulfill({ status: 200, json: { accessToken: "e2e-fake-access-token" } }),
  );
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 200, json: { user } }),
  );
  await page.route("**/api/v1/rbac/user-screens", (route) =>
    route.fulfill({ status: 200, json: { data: {} } }),
  );
};
