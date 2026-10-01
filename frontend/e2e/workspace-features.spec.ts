import { expect, test, type Page } from "@playwright/test";
import { mockLoggedIn, type MockUser } from "./mocks";

// Covers the workspace-facing screens: org-context banner, workspace search,
// personal + workspace preferences, and the credit history. All network is
// mocked — no real backend/DB, per e2e/README.md.

const user = (plan: MockUser["plan"]): MockUser => ({
  userId: "e2e-user-1",
  email: "e2e-user@example.com",
  displayName: "Alex Morgan",
  phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
  plan,
});

/** Logged in with CORE_APP read access so protected pages render (later routes win in Playwright). */
const signInAs = async (page: Page, plan: MockUser["plan"]): Promise<void> => {
  await mockLoggedIn(page, user(plan));
  await page.route("**/api/v1/rbac/user-screens", (route) =>
    route.fulfill({ status: 200, json: { data: { CORE_APP: { canRead: true } } } }),
  );
};

const workspace = (role: "OWNER" | "ADMIN" | "MEMBER") => ({
  id: "team-1",
  name: "Alpha Fund",
  status: "ACTIVE",
  role,
  seats: { capacity: 5, scheduledCapacity: null, active: 2, pendingInvites: 0, available: 3 },
  creditBalanceInPaisa: 100_000,
  orgInstructions: null,
  billingEmail: null,
  domains: [],
  subscription: null,
});

const mockWorkspace = (page: Page, role: "OWNER" | "ADMIN" | "MEMBER") =>
  page.route("**/api/v1/teams/me", (route) =>
    route.fulfill({ status: 200, json: { success: true, data: workspace(role) } }),
  );

const openTab = async (page: Page, name: string) => {
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Alpha Fund" })).toBeVisible();
  await page.getByRole("tab", { name }).click();
};

// ─── Org-context banner ──────────────────────────────────────────────────────

test.describe("workspace guidance banner", () => {
  const radar = (page: Page, body: Record<string, unknown>) =>
    page.route("**/api/v1/decision-support/market/radar*", (route) =>
      route.fulfill({ status: 200, json: { success: true, data: [], ...body } }),
    );

  test("shows the workspace's AI instructions next to compute output, and clears when they go away", async ({
    page,
  }) => {
    await signInAs(page, "TEAM");
    await radar(page, { orgContext: "Focus on ESG risks and avoid leveraged ETFs." });

    await page.goto("/decision-support/radar");
    const banner = page.getByRole("complementary", { name: "Workspace guidance" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Focus on ESG risks and avoid leveraged ETFs.");

    // The next response carries no orgContext (e.g. instructions removed): banner disappears.
    await page.unroute("**/api/v1/decision-support/market/radar*");
    await radar(page, {});
    await page.getByRole("button", { name: /1W \(Position\)/ }).click();
    await expect(banner).toBeHidden();
  });

  test("is absent for non-team users", async ({ page }) => {
    await signInAs(page, "PRO");
    await radar(page, {});

    await page.goto("/decision-support/radar");
    await expect(page.getByRole("heading", { name: "AI Opportunity Radar" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Workspace guidance" })).toHaveCount(0);
  });

  test("collapses long guidance and expands on demand", async ({ page }) => {
    await signInAs(page, "TEAM");
    const long = `${"Prefer dividend growers. ".repeat(30)}END-OF-GUIDANCE`;
    await radar(page, { orgContext: long });

    await page.goto("/decision-support/radar");
    const banner = page.getByRole("complementary", { name: "Workspace guidance" });
    await expect(banner).not.toContainText("END-OF-GUIDANCE");

    await banner.getByRole("button", { name: /show more/i }).click();
    await expect(banner).toContainText("END-OF-GUIDANCE");
    await banner.getByRole("button", { name: /show less/i }).click();
    await expect(banner).not.toContainText("END-OF-GUIDANCE");
  });
});

// ─── Workspace search ────────────────────────────────────────────────────────

test.describe("workspace search", () => {
  test("searches shared assets and saved AI decisions and renders each group", async ({ page }) => {
    await signInAs(page, "TEAM");
    await mockWorkspace(page, "MEMBER");
    const queries: (string | null)[] = [];
    await page.route("**/api/v1/teams/search*", (route) => {
      queries.push(new URL(route.request().url()).searchParams.get("q"));
      return route.fulfill({
        status: 200,
        json: {
          success: true,
          data: {
            watchlists: [
              { id: "w1", name: "Tech Core", symbols: ["AAPL", "MSFT"], createdBy: "u", createdAt: "2026-09-01T00:00:00Z" },
            ],
            screeners: [],
            notes: [
              { id: "n1", symbol: "AAPL", content: "Services margin is the story.", authorId: "u", createdAt: "2026-09-02T00:00:00Z" },
            ],
            forecasts: [
              {
                id: "f1",
                symbol: "AAPL",
                marketDecision: "BUY",
                portfolioDecision: "HOLD",
                confidence: 0.88,
                run: { id: "r1", userId: "u", runAt: "2026-09-03T00:00:00Z" },
              },
            ],
          },
        },
      });
    });

    await openTab(page, "Search");
    const submit = page.getByRole("button", { name: "Search", exact: true });

    // Too short: disabled, with a hint, and nothing sent.
    await page.getByLabel("Search the workspace").fill("A");
    await expect(submit).toBeDisabled();
    await expect(page.getByText("Type at least 2 characters.")).toBeVisible();

    await page.getByLabel("Search the workspace").fill("aapl");
    await submit.click();

    await expect(page.getByRole("region", { name: "Shared watchlists" })).toContainText("Tech Core");
    await expect(page.getByRole("region", { name: "Research notes" })).toContainText(
      "Services margin is the story.",
    );
    const decisions = page.getByRole("region", { name: "Saved AI decisions" });
    await expect(decisions).toContainText("market BUY, portfolio HOLD");
    await expect(decisions).toContainText("88% confidence");
    // Empty groups are not rendered at all.
    await expect(page.getByRole("region", { name: "Screener presets" })).toHaveCount(0);
    expect(queries).toEqual(["aapl"]);
  });

  test("says so when nothing matches", async ({ page }) => {
    await signInAs(page, "TEAM");
    await mockWorkspace(page, "MEMBER");
    await page.route("**/api/v1/teams/search*", (route) =>
      route.fulfill({
        status: 200,
        json: { success: true, data: { watchlists: [], screeners: [], notes: [], forecasts: [] } },
      }),
    );

    await openTab(page, "Search");
    await page.getByLabel("Search the workspace").fill("zzzz");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page.getByText(/Nothing in the workspace matches "zzzz"/)).toBeVisible();
  });
});

// ─── Preferences ─────────────────────────────────────────────────────────────

test.describe("preferences", () => {
  const view = (over: Record<string, unknown> = {}) => ({
    success: true,
    data: {
      workspace: { theme: "DARK", chartLayout: "GRID", indicators: ["RSI"] },
      personal: {},
      effective: { theme: "DARK", chartLayout: "GRID", indicators: ["RSI"] },
      ...over,
    },
  });

  test("personal overrides show the workspace default and clear back to it with null", async ({
    page,
  }) => {
    await signInAs(page, "TEAM");
    await mockWorkspace(page, "MEMBER");
    await page.route("**/api/v1/teams/preferences", (route) => {
      if (route.request().method() === "PATCH") {
        bodies.push(route.request().postDataJSON());
        return route.fulfill({
          status: 200,
          json: view({ personal: { theme: "LIGHT" }, effective: { theme: "LIGHT", chartLayout: "GRID", indicators: ["RSI"] } }),
        });
      }
      return route.fulfill({ status: 200, json: view() });
    });
    const bodies: unknown[] = [];

    await openTab(page, "Preferences");
    const personal = page.getByRole("form", { name: "personal preferences" });

    // The inherited workspace values are visible as the "default" option.
    await expect(personal.getByLabel("Theme").locator("option").first()).toHaveText(
      "Workspace default (Dark)",
    );
    await expect(personal.getByLabel("Chart layout").locator("option").first()).toHaveText(
      "Workspace default (Grid)",
    );
    await expect(personal.getByText("Workspace default: RSI.")).toBeVisible();

    await personal.getByLabel("Theme").selectOption("LIGHT");
    await personal.getByRole("button", { name: "Save preferences" }).click();

    // Set what was chosen; everything left on "default" is sent as null (cleared).
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toEqual({ theme: "LIGHT", chartLayout: null, indicators: null });
    // Members don't get the workspace-defaults editor.
    await expect(page.getByRole("form", { name: "workspace preferences" })).toHaveCount(0);
  });

  test("admins can edit workspace defaults, including indicators", async ({ page }) => {
    await signInAs(page, "TEAM");
    await mockWorkspace(page, "ADMIN");
    const bodies: unknown[] = [];
    await page.route("**/api/v1/teams/preferences/workspace", (route) => {
      bodies.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, json: view() });
    });
    await page.route("**/api/v1/teams/preferences", (route) =>
      route.fulfill({ status: 200, json: view() }),
    );

    await openTab(page, "Preferences");
    const workspaceForm = page.getByRole("form", { name: "workspace preferences" });
    await expect(workspaceForm.getByLabel("Theme")).toHaveValue("DARK");

    await workspaceForm.getByLabel("Chart layout").selectOption("SPLIT");
    await workspaceForm.getByLabel("Indicators").fill("RSI, MACD, rsi,  SMA50 ,");
    await workspaceForm.getByRole("button", { name: "Save workspace defaults" }).click();

    await expect.poll(() => bodies.length).toBe(1);
    // De-duplicated case-insensitively, blanks dropped.
    expect(bodies[0]).toEqual({
      theme: "DARK",
      chartLayout: "SPLIT",
      indicators: ["RSI", "MACD", "SMA50"],
    });
  });

  test("rejects an oversized indicator list before calling the API", async ({ page }) => {
    await signInAs(page, "TEAM");
    await mockWorkspace(page, "ADMIN");
    let patched = false;
    await page.route("**/api/v1/teams/preferences*", (route) => {
      if (route.request().method() === "PATCH") patched = true;
      return route.fulfill({ status: 200, json: view() });
    });

    await openTab(page, "Preferences");
    const personal = page.getByRole("form", { name: "personal preferences" });
    await personal.getByLabel("Indicators").fill("x".repeat(41));
    await personal.getByRole("button", { name: "Save preferences" }).click();

    await expect(page.getByText(/Indicators: up to 20 names/)).toBeVisible();
    expect(patched).toBe(false);
  });

  test("Settings shows personal display preferences for any user", async ({ page }) => {
    await signInAs(page, "PRO");
    await page.route("**/api/v1/teams/preferences", (route) =>
      route.fulfill({
        status: 200,
        json: view({ workspace: {}, effective: {} }),
      }),
    );

    await page.goto("/settings");
    await expect(page.getByText("Display preferences")).toBeVisible();
    const form = page.getByRole("form", { name: "personal preferences" });
    // Not in a workspace, so the fallback option is simply "Default".
    await expect(form.getByLabel("Theme").locator("option").first()).toHaveText("Default");
  });
});

// ─── Credit history ──────────────────────────────────────────────────────────

test.describe("credit history", () => {
  const entry = (n: number, over: Record<string, unknown> = {}) => ({
    id: `entry-${n}`,
    amountPaisa: -5_000,
    type: "OVERAGE_CONSUMPTION",
    description: `Overage: ai_forecast SYM${n}`,
    createdAt: `2026-09-${String(20 - n).padStart(2, "0")}T10:00:00Z`,
    isTeamPool: false,
    ...over,
  });

  test("workspace admins see the pool history with member names and can load older entries", async ({
    page,
  }) => {
    await signInAs(page, "TEAM");
    await mockWorkspace(page, "OWNER");
    const requests: { scope: string | null; cursor: string | null }[] = [];
    await page.route("**/api/v1/payments/credits/ledger*", (route) => {
      const params = new URL(route.request().url()).searchParams;
      requests.push({ scope: params.get("scope"), cursor: params.get("cursor") });
      const first = !params.get("cursor");
      return route.fulfill({
        status: 200,
        json: {
          success: true,
          data: {
            scope: "TEAM",
            balanceInPaisa: 95_000,
            entries: first
              ? [
                  entry(1, { memberName: "Olivia", isTeamPool: true }),
                  entry(2, { memberName: "Max", isTeamPool: true, amountPaisa: 100_000, type: "PURCHASE", description: "Credit top-up" }),
                ]
              : [entry(3, { memberName: "Olivia", isTeamPool: true })],
            nextCursor: first ? "entry-2" : null,
          },
        },
      });
    });

    await openTab(page, "Credits");

    await expect(page.getByTestId("ledger-balance")).toHaveText("Rs 950");
    await expect(page.getByRole("row", { name: /Overage: ai_forecast SYM1/ })).toContainText("Olivia");
    await expect(page.getByRole("row", { name: /Credit top-up/ })).toContainText("+Rs 1,000");
    await expect(page.getByRole("row", { name: /SYM1/ })).toContainText("−Rs 50");
    await expect(page.getByRole("row", { name: /SYM3/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Load more" }).click();
    await expect(page.getByRole("row", { name: /SYM3/ })).toBeVisible();
    // Everything is loaded now, so the button goes away.
    await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);

    expect(requests).toEqual([
      { scope: "TEAM", cursor: null },
      { scope: "TEAM", cursor: "entry-2" },
    ]);
  });

  test("plain workspace members do not get the workspace Credits tab", async ({ page }) => {
    await signInAs(page, "TEAM");
    await mockWorkspace(page, "MEMBER");

    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Alpha Fund" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Credits" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Preferences" })).toBeVisible();
  });

  test("Settings shows a paid user's own history under a Credits tab", async ({ page }) => {
    await signInAs(page, "PRO");
    const scopes: (string | null)[] = [];
    await page.route("**/api/v1/payments/credits/ledger*", (route) => {
      scopes.push(new URL(route.request().url()).searchParams.get("scope"));
      return route.fulfill({
        status: 200,
        json: {
          success: true,
          data: { scope: "USER", balanceInPaisa: 0, entries: [], nextCursor: null },
        },
      });
    });
    await page.route("**/api/v1/teams/preferences", (route) =>
      route.fulfill({ status: 200, json: { success: true, data: { workspace: {}, personal: {}, effective: {} } } }),
    );

    await page.goto("/settings");
    await page.getByRole("button", { name: /Credits/ }).click();

    await expect(page.getByTestId("ledger-balance")).toHaveText("Rs 0");
    await expect(page.getByText(/No credit activity yet/)).toBeVisible();
    expect(scopes).toEqual(["USER"]);
  });

  test("free users have no Credits tab in Settings", async ({ page }) => {
    await signInAs(page, "FREE");
    await page.route("**/api/v1/teams/preferences", (route) =>
      route.fulfill({ status: 200, json: { success: true, data: { workspace: {}, personal: {}, effective: {} } } }),
    );

    await page.goto("/settings");
    await expect(page.getByText("Display preferences")).toBeVisible();
    await expect(page.getByRole("button", { name: /Credits/ })).toHaveCount(0);
  });

  test("surfaces a load failure with a retry", async ({ page }) => {
    await signInAs(page, "TEAM");
    await mockWorkspace(page, "ADMIN");
    let calls = 0;
    await page.route("**/api/v1/payments/credits/ledger*", (route) => {
      calls += 1;
      return calls === 1
        ? route.fulfill({ status: 500, json: { success: false, message: "Ledger unavailable" } })
        : route.fulfill({
            status: 200,
            json: { success: true, data: { scope: "TEAM", balanceInPaisa: 0, entries: [], nextCursor: null } },
          });
    });

    await openTab(page, "Credits");
    await expect(page.getByRole("alert")).toContainText("Ledger unavailable");

    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("ledger-balance")).toBeVisible();
  });
});
