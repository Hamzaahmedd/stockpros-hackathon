import { expect, test, type Page, type Route } from "@playwright/test";
import { mockLoggedIn } from "./mocks";

// Characterises the axios 401 → refresh → retry-once flow (shared/api/axios.ts).
// It had no test coverage, so these pin the behaviour before its retry marker is
// refactored, and stay as its safety net. All network is mocked — no real
// backend/DB, per e2e/README.md.

const INITIAL_TOKEN = "e2e-fake-access-token";

const TEAM_PREFS = { success: true, data: { workspace: {}, personal: {}, effective: {} } };
const NOTIFICATION_PREFS = {
  success: true,
  data: {
    marketInterests: [],
    inAppAlertsEnabled: true,
    emailVolatilityAlertsEnabled: true,
    dailyDigestEnabled: true,
  },
};

interface Harness {
  /** Refreshes triggered by a failed request (the app's own mount-time session check is excluded). */
  refreshCalls: () => number;
  /** Requests seen by the guarded endpoint, with the bearer token each carried. */
  seen: { auth: string | undefined }[];
}

/**
 * Logs in (the app's mount-time session check uses the first refresh call),
 * then takes over the refresh route so tests can count calls and control what
 * each returns. The guarded endpoint is GET /teams/preferences, which the
 * Settings page requests on mount.
 */
const setup = async (
  page: Page,
  options: {
    refreshFails?: boolean;
    endpoint: (route: Route, attempt: number) => Promise<void> | void;
  },
): Promise<Harness> => {
  await mockLoggedIn(page, {
    userId: "e2e-user-1",
    email: "e2e-user@example.com",
    displayName: "Alex Morgan",
    phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
    plan: "PRO",
  });
  await page.route("**/api/v1/rbac/user-screens", (route) =>
    route.fulfill({ status: 200, json: { data: { CORE_APP: { canRead: true } } } }),
  );
  await page.route("**/api/v1/notifications/preferences", (route) =>
    route.fulfill({ status: 200, json: NOTIFICATION_PREFS }),
  );

  let refreshes = 0;
  await page.route("**/api/v1/auth/refresh-token", (route) => {
    refreshes += 1;
    if (refreshes === 1) {
      return route.fulfill({ status: 200, json: { accessToken: INITIAL_TOKEN } });
    }
    if (options.refreshFails) {
      return route.fulfill({ status: 401, json: { success: false, message: "Session expired" } });
    }
    return route.fulfill({ status: 200, json: { accessToken: `refreshed-token-${refreshes}` } });
  });

  const seen: Harness["seen"] = [];
  let attempt = 0;
  await page.route("**/api/v1/teams/preferences", (route) => {
    attempt += 1;
    seen.push({ auth: route.request().headers()["authorization"] });
    return options.endpoint(route, attempt);
  });

  return { refreshCalls: () => refreshes - 1, seen };
};

const ok = (route: Route) => route.fulfill({ status: 200, json: TEAM_PREFS });
const unauthorized = (route: Route) => route.fulfill({ status: 401, json: { success: false } });

test.describe("401 → refresh → single retry", () => {
  test("an expired token is refreshed once and the request is retried with the new token", async ({ page }) => {
    const h = await setup(page, {
      endpoint: (route, attempt) => (attempt === 1 ? unauthorized(route) : ok(route)),
    });

    await page.goto("/settings");

    // The retry succeeded, so the form rendered instead of an error.
    await expect(page.getByRole("form", { name: "personal preferences" })).toBeVisible();
    expect(h.refreshCalls()).toBe(1);
    expect(h.seen).toHaveLength(2);
    expect(h.seen[0].auth).toBe(`Bearer ${INITIAL_TOKEN}`);
    expect(h.seen[1].auth).toBe("Bearer refreshed-token-2");
  });

  test("a request that keeps failing with 401 is retried exactly once — no refresh loop", async ({ page }) => {
    const h = await setup(page, { endpoint: unauthorized });

    await page.goto("/settings");
    await expect(page.getByText("Couldn't load preferences")).toBeVisible();

    expect(h.refreshCalls()).toBe(1);
    expect(h.seen).toHaveLength(2); // original + one retry, then it gives up
  });

  test("if the refresh itself fails the request is not retried and the refresh error surfaces", async ({ page }) => {
    const h = await setup(page, { refreshFails: true, endpoint: unauthorized });

    await page.goto("/settings");
    // The rejection the caller sees is the failed refresh (with its own message).
    await expect(page.getByText("Session expired")).toBeVisible();

    expect(h.refreshCalls()).toBe(1);
    expect(h.seen).toHaveLength(1);
  });

  for (const status of [400, 403, 404, 500]) {
    test(`a ${status} response does not trigger a token refresh`, async ({ page }) => {
      const h = await setup(page, {
        endpoint: (route) => route.fulfill({ status, json: { success: false } }),
      });

      await page.goto("/settings");
      await expect(page.getByText("Couldn't load preferences")).toBeVisible();

      expect(h.refreshCalls()).toBe(0);
      expect(h.seen).toHaveLength(1);
    });
  }
});

test.describe("concurrent 401s", () => {
  test("two requests failing together share ONE refresh and are both retried", async ({ page }) => {
    // Settings fires two API calls on mount: notification preferences and team preferences.
    const h = await setup(page, {
      endpoint: (route, attempt) => (attempt === 1 ? unauthorized(route) : ok(route)),
    });
    let notificationAttempts = 0;
    const notificationAuth: (string | undefined)[] = [];
    await page.route("**/api/v1/notifications/preferences", (route) => {
      notificationAttempts += 1;
      notificationAuth.push(route.request().headers()["authorization"]);
      return notificationAttempts === 1
        ? unauthorized(route)
        : route.fulfill({ status: 200, json: NOTIFICATION_PREFS });
    });

    await page.goto("/settings");
    await expect(page.getByRole("form", { name: "personal preferences" })).toBeVisible();

    expect(h.refreshCalls()).toBe(1); // one refresh, not two
    expect(h.seen).toHaveLength(2);
    expect(notificationAttempts).toBe(2);
    expect(h.seen[1].auth).toBe("Bearer refreshed-token-2");
    expect(notificationAuth[1]).toBe("Bearer refreshed-token-2");
  });
});

test.describe("the session check itself is never refreshed", () => {
  test("a 401 from /auth/me leaves the user logged out without starting another refresh", async ({ page }) => {
    let refreshes = 0;
    await page.route("**/api/v1/auth/refresh-token", (route) => {
      refreshes += 1;
      return route.fulfill({ status: 200, json: { accessToken: INITIAL_TOKEN } });
    });
    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({ status: 401, json: { success: false, message: "Unauthorized" } }),
    );

    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login$/);
    // One refresh for the mount-time session check; /auth/me's 401 must not start another.
    expect(refreshes).toBe(1);
  });
});
