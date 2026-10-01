import { expect, test, type Page, type Route } from "@playwright/test";
import { mockLoggedIn, type MockUser } from "./mocks";

// Internal staff ops panel: route guards (tier flag + platform role) and
// role-gated controls. All network is mocked — no real backend/DB, per e2e/README.md.

type Role = NonNullable<MockUser["platformRole"]>;

const REASON = "Customer escalation #4821, approved by finance";

const USER_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Sam Lee",
  email: "sam@fund.com",
  status: "ACTIVE",
  plan: "PRO",
  platformRole: "USER",
  creditBalanceInPaisa: 250_000,
  activeSessions: 2,
  deletedAt: null,
  subscription: null,
  team: null,
};

const ok = (route: Route, data: unknown = undefined) =>
  route.fulfill({ status: 200, json: { success: true, message: "ok", data } });

const openAdmin = async (page: Page, role: Role, pricingTiersEnabled = true) => {
  await mockLoggedIn(
    page,
    {
      userId: "staff-1",
      email: "staff@venturedive.com",
      displayName: "Staff Member",
      phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
      platformRole: role,
    },
    { pricingTiersEnabled },
  );
  await page.route("**/api/v1/rbac/user-screens", (route) =>
    route.fulfill({ status: 200, json: { data: { CORE_APP: { canRead: true } } } }),
  );
  await page.route("**/api/v1/admin/users/search**", (route) => ok(route, [USER_ROW]));
  await page.goto("/admin");
};

const searchForSam = async (page: Page) => {
  await page.getByLabel("Search users").fill("sam");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("sam@fund.com")).toBeVisible();
};

test.describe("route guards", () => {
  test("a regular user is redirected away from /admin", async ({ page }) => {
    await openAdmin(page, "USER");
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test("staff are redirected away while the tier-based workflow is off", async ({ page }) => {
    await openAdmin(page, "SUPER_ADMIN", false);
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test("staff in the tier-based workflow see the five sections", async ({ page }) => {
    await openAdmin(page, "SUPPORT_AGENT");
    await expect(page.getByRole("heading", { name: "Staff operations" })).toBeVisible();
    for (const name of [
      "User lookup & plans",
      "Team workspaces",
      "Billing, credits & webhooks",
      "Telemetry & queues",
      "System & audit log",
    ]) {
      await expect(page.getByRole("tab", { name })).toBeVisible();
    }
  });
});

test.describe("role-gated controls", () => {
  test("a support agent can search but has no write actions", async ({ page }) => {
    await openAdmin(page, "SUPPORT_AGENT");
    await searchForSam(page);
    await expect(page.getByRole("button", { name: "Change plan" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Revoke sessions" })).toHaveCount(0);
  });

  test("a platform admin still cannot override plans", async ({ page }) => {
    await openAdmin(page, "PLATFORM_ADMIN");
    await searchForSam(page);
    await expect(page.getByRole("button", { name: "Change plan" })).toHaveCount(0);
  });

  test("a super admin overrides a plan with an audited reason", async ({ page }) => {
    await openAdmin(page, "SUPER_ADMIN");
    let body: unknown;
    await page.route("**/api/v1/admin/users/*/plan-override", (route) => {
      body = route.request().postDataJSON();
      return ok(route, { plan: "TEAM" });
    });

    await searchForSam(page);
    await page.getByRole("button", { name: "Change plan" }).click();
    await page.getByLabel("New plan").selectOption("TEAM");

    const confirm = page.getByRole("button", { name: "Override plan" });
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Reason (audited)").fill("too short");
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Reason (audited)").fill(REASON);
    await page.getByLabel("Support ticket").fill("sup-4821");
    await confirm.click();

    await expect
      .poll(() => body)
      .toEqual({ plan: "TEAM", reason: REASON, ticketRef: "SUP-4821" });
    await expect(page.getByText("Plan overridden")).toBeVisible();
  });

  test("credit adjustments are available to platform admins and use amountPaisa", async ({
    page,
  }) => {
    await openAdmin(page, "PLATFORM_ADMIN");
    await page.route("**/api/v1/admin/billing/webhooks**", (route) =>
      ok(route, { items: [], total: 0, page: 1, limit: 25 }),
    );
    let body: unknown;
    await page.route("**/api/v1/admin/billing/credits/adjust", (route) => {
      body = route.request().postDataJSON();
      return ok(route, { balanceInPaisa: 750_000 });
    });

    await page.getByRole("tab", { name: "Billing, credits & webhooks" }).click();
    await page.getByRole("button", { name: "Adjust credits" }).click();
    await page.getByLabel("Target ID").fill(USER_ROW.id);
    await page.getByLabel("Amount in paisa").fill("500000");
    await page.getByLabel("Reason (audited)").fill(REASON);
    await page.getByRole("button", { name: "Apply adjustment" }).click();

    await expect
      .poll(() => body)
      .toEqual({ target: "USER", targetId: USER_ROW.id, amountPaisa: 500000, reason: REASON });
  });

  test("the market halt control is reserved for super admins", async ({ page }) => {
    await page.route("**/api/v1/admin/system/**", (route) => {
      const url = route.request().url();
      return url.endsWith("market-status")
        ? ok(route, { emergencyClosed: false })
        : ok(route, { items: [], total: 0, page: 1, limit: 25 });
    });

    await openAdmin(page, "SUPPORT_AGENT");
    await page.getByRole("tab", { name: "System & audit log" }).click();
    await expect(page.getByText("Normal calendar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Halt market" })).toHaveCount(0);
  });
});
