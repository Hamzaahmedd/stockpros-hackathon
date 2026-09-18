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
