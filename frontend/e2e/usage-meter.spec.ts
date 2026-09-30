import { expect, test, type Page } from "@playwright/test";
import { mockLoggedIn, type MockFlags, type MockUser } from "./mocks";

// Covers the AI-signal quota meter and Top up button (Settings → Credits,
// Manage Subscription, workspace Overview) and the payments-off top-up dialog.
// All network is mocked — no real backend/DB, per e2e/README.md.

const ENFORCED_WITH_PAYMENTS: MockFlags = {
  pricingTiersEnabled: true,
  enablePaymentProcessor: true,
};

const signInAs = async (
  page: Page,
  plan: MockUser["plan"],
  flags: MockFlags = ENFORCED_WITH_PAYMENTS,
): Promise<void> => {
  await mockLoggedIn(
    page,
    {
      userId: "e2e-user-1",
      email: "e2e-user@example.com",
      displayName: "Alex Morgan",
      phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
      plan,
    },
    flags,
  );
  await page.route("**/api/v1/rbac/user-screens", (route) =>
    route.fulfill({ status: 200, json: { data: { CORE_APP: { canRead: true } } } }),
  );
  // Settings → Credits also loads history and preferences; keep them quiet.
  await page.route("**/api/v1/payments/credits/ledger*", (route) =>
    route.fulfill({
      status: 200,
      json: { success: true, data: { scope: "USER", balanceInPaisa: 0, entries: [], nextCursor: null } },
    }),
  );
  await page.route("**/api/v1/teams/preferences", (route) =>
    route.fulfill({ status: 200, json: { success: true, data: { workspace: {}, personal: {}, effective: {} } } }),
  );
};

type UsageOverrides = {
  used?: number;
  limit?: number;
  windowEnd?: string | null;
  balanceInPaisa?: number;
  pool?: "USER" | "TEAM";
  canTopUp?: boolean;
  spendCap?: { monthlyLimitPaisa: number; spentPaisa: number; remainingPaisa: number } | null;
  plan?: "FREE" | "PRO" | "TEAM";
  metered?: boolean;
};

const usage = (o: UsageOverrides = {}) => {
  const limit = o.limit ?? 300;
  const used = o.used ?? 212;
  const balance = o.balanceInPaisa ?? 95_000;
  return {
    success: true,
    data: {
      plan: o.plan ?? "PRO",
      metered: o.metered ?? true,
      quota: {
        limit,
        used,
        remaining: Math.max(limit - used, 0),
        windowStart: "2030-09-10T12:00:00.000Z",
        windowEnd: o.windowEnd === undefined ? "2030-10-10T12:00:00.000Z" : o.windowEnd,
        windowSource: "SUBSCRIPTION_PERIOD",
      },
      credits: {
        pool: o.pool ?? "USER",
        balanceInPaisa: balance,
        costPerSignalPaisa: 5_000,
        signalsAvailable: Math.floor(balance / 5_000),
        canTopUp: o.canTopUp ?? true,
      },
      spendCap: o.spendCap ?? null,
    },
  };
};

const mockUsage = (page: Page, o: UsageOverrides = {}) =>
  page.route("**/api/v1/payments/me/usage", (route) =>
    route.fulfill({ status: 200, json: usage(o) }),
  );

const openSettingsCredits = async (page: Page) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /Credits/ }).click();
  return page.getByRole("region", { name: "AI signal usage" });
};

const bar = (page: Page) => page.getByRole("progressbar", { name: "AI signals used this cycle" });

test.describe("Pro plan meter (Settings → Credits)", () => {
  test("shows signals used of the included allowance, what is left, the reset date and the credit balance", async ({ page }) => {
    await signInAs(page, "PRO");
    await mockUsage(page);

    const meter = await openSettingsCredits(page);

    await expect(meter.getByTestId("quota-used")).toHaveText("212");
    await expect(meter.getByTestId("quota-limit")).toHaveText("300");
    await expect(meter).toContainText("88 included signals left this cycle.");
    await expect(meter).toContainText("Resets Oct 10, 2030");
    await expect(bar(page)).toHaveAttribute("aria-valuenow", "212");
    await expect(bar(page)).toHaveAttribute("aria-valuemax", "300");
    await expect(meter.getByTestId("credit-balance")).toHaveText("Rs 950");
    await expect(meter).toContainText("≈ 19 extra signals");
    await expect(meter.getByText("Your credits")).toBeVisible();
    await expect(meter.getByRole("button", { name: "Top up credits" })).toBeEnabled();
  });

  test("singular wording for exactly one signal left", async ({ page }) => {
    await signInAs(page, "PRO");
    await mockUsage(page, { used: 299 });

    const meter = await openSettingsCredits(page);
    await expect(meter).toContainText("1 included signal left this cycle.");
  });

  test.describe("bar colour tracks how close to the limit you are", () => {
    for (const [label, used, colour] of [
      ["comfortable", 100, /bg-primary/],
      ["warning from 80%", 240, /bg-amber-500/],
      ["over the line at 100%", 300, /bg-red-500/],
    ] as const) {
      test(`${label} (${used}/300)`, async ({ page }) => {
        await signInAs(page, "PRO");
        await mockUsage(page, { used });

        await openSettingsCredits(page);
        await expect(bar(page).locator("div")).toHaveClass(colour);
      });
    }
  });

  test("past the allowance it explains the per-signal cost and keeps the bar full, never overflowing", async ({ page }) => {
    await signInAs(page, "PRO");
    await mockUsage(page, { used: 312 });

    const meter = await openSettingsCredits(page);

    await expect(meter).toContainText("Included signals used — each extra one costs Rs 50 from credits.");
    await expect(bar(page)).toHaveAttribute("aria-valuenow", "300"); // clamped to the max
    await expect(bar(page).locator("div")).toHaveAttribute("style", /width: 100%/);
  });

  test("out of signals AND credits: a clear alert, and the Top up button is the primary action", async ({ page }) => {
    await signInAs(page, "PRO");
    await mockUsage(page, { used: 300, balanceInPaisa: 2_000 }); // < Rs 50: cannot buy one more

    const meter = await openSettingsCredits(page);

    await expect(meter.getByRole("alert")).toContainText("You're out of AI signals.");
    await expect(meter.getByRole("alert")).toContainText("Top up credits to keep using forecasts and market decisions.");
    await expect(meter).toContainText("≈ 0 extra signals");
  });

  test("with credits left there is no out-of-signals alert even when the allowance is used", async ({ page }) => {
    await signInAs(page, "PRO");
    await mockUsage(page, { used: 300, balanceInPaisa: 50_000 });

    const meter = await openSettingsCredits(page);
    await expect(meter.getByRole("alert")).toHaveCount(0);
  });

  test("a lapsed billing period says so instead of a reset date", async ({ page }) => {
    await signInAs(page, "PRO");
    await mockUsage(page, { windowEnd: "2020-01-01T12:00:00.000Z" });

    const meter = await openSettingsCredits(page);
    await expect(meter).toContainText("Billing period ended — renew to reset");
    await expect(meter).not.toContainText("Resets");
  });

  test("surfaces a load failure with a retry", async ({ page }) => {
    await signInAs(page, "PRO");
    let calls = 0;
    await page.route("**/api/v1/payments/me/usage", (route) => {
      calls += 1;
      return calls === 1
        ? route.fulfill({ status: 500, json: { success: false, message: "Usage unavailable" } })
        : route.fulfill({ status: 200, json: usage() });
    });

    await page.goto("/settings");
    await page.getByRole("button", { name: /Credits/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Usage unavailable" })).toBeVisible();

    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("quota-used")).toHaveText("212");
  });
});

test.describe("Top up credits button", () => {
  test("opens the packs and starts a TOPUP checkout for the chosen pack", async ({ page }) => {
    await signInAs(page, "PRO");
    await mockUsage(page);
    const bodies: unknown[] = [];
    await page.route("**/api/v1/payments/create-checkout", (route) => {
      bodies.push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        json: {
          success: true,
          checkoutUrl: "http://localhost:4173/plans/result?tracker_id=trk-topup&status=success",
          trackerId: "trk-topup",
        },
      });
    });
    await page.route("**/api/v1/payments/verify-tracker", (route) =>
      route.fulfill({ status: 200, json: { trackerId: "trk-topup", status: "PENDING", plan: "PRO" } }),
    );

    const meter = await openSettingsCredits(page);
    await meter.getByRole("button", { name: "Top up credits" }).click();

    const dialog = page.getByRole("dialog", { name: "Top up credits" });
    await expect(dialog).toContainText("Rs 500");
    await expect(dialog).toContainText("≈ 10 AI signals");
    await expect(dialog).toContainText("Rs 1,000");
    await expect(dialog).toContainText("≈ 20 AI signals");
    await expect(dialog).toContainText("Rs 2,500");
    await expect(dialog).toContainText("≈ 50 AI signals");

    await dialog.getByRole("button", { name: /Rs 1,000/ }).click();

    await expect(page).toHaveURL(/\/plans\/result\?tracker_id=trk-topup/);
    // The client sends only the pack id — the amount is derived on the server.
    expect(bodies).toEqual([{ plan: "TOPUP", packId: "PACK_1000" }]);
  });

  test("can be dismissed without buying anything", async ({ page }) => {
    await signInAs(page, "PRO");
    await mockUsage(page);
    let checkouts = 0;
    await page.route("**/api/v1/payments/create-checkout", (route) => {
      checkouts += 1;
      return route.abort();
    });

    const meter = await openSettingsCredits(page);
    await meter.getByRole("button", { name: "Top up credits" }).click();
    await page.getByRole("button", { name: "Not now" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(checkouts).toBe(0);
  });

  test("with online payments off the button is disabled and says why", async ({ page }) => {
    await signInAs(page, "PRO", { pricingTiersEnabled: true, enablePaymentProcessor: false });
    await mockUsage(page);

    const meter = await openSettingsCredits(page);

    await expect(meter.getByRole("button", { name: "Top up credits" })).toBeDisabled();
    await expect(meter).toContainText("Top-ups need online payments, which aren't enabled here.");
    // The meter itself still works.
    await expect(meter.getByTestId("quota-used")).toHaveText("212");
  });

  test("when a request is rejected with OVERAGE_REQUIRED and payments are off, the dialog explains instead of offering broken packs", async ({ page }) => {
    await signInAs(page, "PRO", { pricingTiersEnabled: true, enablePaymentProcessor: false });
    await page.route("**/api/v1/decision-support/market/radar*", (route) =>
      route.fulfill({
        status: 403,
        json: {
          success: false,
          message: "Quota exhausted",
          errorCode: "OVERAGE_REQUIRED",
          details: { code: "OVERAGE_REQUIRED", reason: "INSUFFICIENT_CREDITS", feature: "ai_decision", canTopUp: true },
        },
      }),
    );

    await page.goto("/decision-support/radar");

    const dialog = page.getByRole("dialog", { name: "Top up credits" });
    await expect(dialog.getByRole("status")).toContainText("Credit top-ups aren't available right now");
    await expect(dialog.getByRole("button", { name: /Rs 500/ })).toHaveCount(0);
  });

  test("when payments are on, that same rejection opens the real packs", async ({ page }) => {
    await signInAs(page, "PRO");
    await page.route("**/api/v1/decision-support/market/radar*", (route) =>
      route.fulfill({
        status: 403,
        json: {
          success: false,
          message: "Quota exhausted",
          errorCode: "OVERAGE_REQUIRED",
          details: { code: "OVERAGE_REQUIRED", reason: "INSUFFICIENT_CREDITS", feature: "ai_decision", canTopUp: true },
        },
      }),
    );

    await page.goto("/decision-support/radar");

    const dialog = page.getByRole("dialog", { name: "Top up credits" });
    await expect(dialog.getByRole("button", { name: /Rs 500/ })).toBeVisible();
  });
});

test.describe("where the meter does and does not appear", () => {
  test("is hidden, and never requested, while pricing tiers are not enforced", async ({ page }) => {
    await signInAs(page, "PRO", { pricingTiersEnabled: false, enablePaymentProcessor: false });
    let requested = false;
    await page.route("**/api/v1/payments/me/usage", (route) => {
      requested = true;
      return route.fulfill({ status: 200, json: usage() });
    });

    await page.goto("/settings");
    // Credits tab still exists for paid users (history); the meter does not.
    await page.getByRole("button", { name: /Credits/ }).click();
    await expect(page.getByTestId("ledger-balance")).toBeVisible();
    await expect(page.getByRole("region", { name: "AI signal usage" })).toHaveCount(0);
    expect(requested).toBe(false);
  });

  test("renders nothing when the server says the plan is not metered", async ({ page }) => {
    await signInAs(page, "PRO");
    await page.route("**/api/v1/payments/me/usage", (route) =>
      route.fulfill({
        status: 200,
        json: { success: true, data: { plan: "FREE", metered: false, quota: null, credits: null, spendCap: null } },
      }),
    );

    await page.goto("/settings");
    await page.getByRole("button", { name: /Credits/ }).click();
    await expect(page.getByTestId("ledger-balance")).toBeVisible();
    await expect(page.getByRole("region", { name: "AI signal usage" })).toHaveCount(0);
  });

  test("Pro users also see it on Manage Subscription", async ({ page }) => {
    await signInAs(page, "PRO");
    await mockUsage(page);
    await page.route("**/api/v1/payments/subscription*", (route) =>
      route.fulfill({
        status: 200,
        json: {
          success: true,
          paymentMethod: "CARD",
          autoRenew: true,
          status: "ACTIVE",
          currentPeriodEnd: "2030-10-10T12:00:00.000Z",
          gracePeriodEnd: null,
        },
      }),
    );

    await page.goto("/plans/manage");
    await expect(page.getByRole("region", { name: "AI signal usage" })).toContainText("212");
  });
});

test.describe("team members", () => {
  const workspace = (role: "OWNER" | "ADMIN" | "MEMBER") => ({
    id: "team-1",
    name: "Alpha Fund",
    status: "ACTIVE",
    role,
    seats: { capacity: 5, active: 2, pendingInvites: 0, available: 3 },
    creditBalanceInPaisa: 250_000,
    orgInstructions: null,
    domains: [],
    subscription: null,
  });

  const openWorkspace = async (page: Page, role: "OWNER" | "ADMIN" | "MEMBER") => {
    await page.route("**/api/v1/teams/me", (route) =>
      route.fulfill({ status: 200, json: { success: true, data: workspace(role) } }),
    );
    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Alpha Fund" })).toBeVisible();
    return page.getByRole("region", { name: "AI signal usage" });
  };

  test("a plain member sees the shared pool and their cap, but cannot top up", async ({ page }) => {
    await signInAs(page, "TEAM");
    await mockUsage(page, {
      plan: "TEAM",
      limit: 375,
      used: 100,
      pool: "TEAM",
      balanceInPaisa: 250_000,
      canTopUp: false,
      spendCap: { monthlyLimitPaisa: 20_000, spentPaisa: 15_000, remainingPaisa: 5_000 },
    });

    const meter = await openWorkspace(page, "MEMBER");

    await expect(meter.getByTestId("quota-limit")).toHaveText("375");
    await expect(meter.getByText("Workspace credits")).toBeVisible();
    await expect(meter.getByTestId("credit-balance")).toHaveText("Rs 2,500");
    await expect(meter.getByTestId("spend-cap")).toContainText("Rs 150 used of Rs 200 (Rs 50 left)");
    await expect(meter.getByRole("button", { name: "Top up credits" })).toHaveCount(0);
    await expect(meter).toContainText("Only a workspace owner or admin can top up the shared credits.");
  });

  test("an out-of-signals member is told to ask an admin rather than shown a Top up button", async ({ page }) => {
    await signInAs(page, "TEAM");
    await mockUsage(page, {
      plan: "TEAM",
      limit: 375,
      used: 375,
      pool: "TEAM",
      balanceInPaisa: 0,
      canTopUp: false,
    });

    const meter = await openWorkspace(page, "MEMBER");

    await expect(meter.getByRole("alert")).toContainText("Ask a workspace admin to top up the shared credits.");
  });

  test("an admin can top up the shared pool from the workspace page", async ({ page }) => {
    await signInAs(page, "TEAM");
    await mockUsage(page, { plan: "TEAM", limit: 375, used: 100, pool: "TEAM", balanceInPaisa: 250_000, canTopUp: true });

    const meter = await openWorkspace(page, "ADMIN");
    await meter.getByRole("button", { name: "Top up credits" }).click();

    const dialog = page.getByRole("dialog", { name: "Top up credits" });
    await expect(dialog).toContainText("Credits are added to the shared workspace pool.");
  });
});
