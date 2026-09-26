import { expect, test } from "@playwright/test";
import { mockLoggedOut } from "./mocks";

// Covers the Free-plan watchlist cap warning added to Onboarding
// (frontend/src/modules/auth/pages/Onboarding.tsx) — mirrors the backend's
// requireWatchlistLimitForFree limit of 10 symbols. Onboarding renders with
// no auth guard (see App.tsx: `/auth/onboarding` is not wrapped in
// ProtectedRoute), so this needs no logged-in session — mockLoggedOut is
// enough, same rationale as login.spec.ts and not-found.spec.ts.
//
// Symbols are added via the custom-ticker search box rather than the
// curated suggestion grid: the grid is pre-filtered by the default market
// interests (DEFAULT_NOTIFICATION_PREFERENCES in constants.ts only shows
// "tech"/"growth" category tickers by default), while a custom-searched
// symbol is tagged category "all" and always renders regardless of
// interest filtering — the simplest way to deterministically reach 10.

const addCustomSymbol = async (
  page: import("@playwright/test").Page,
  symbol: string,
) => {
  await page.getByPlaceholder(/Search any ticker/i).fill(symbol);
  await page.getByRole("button", { name: "Add" }).click();
};

test("warns inline, without blocking, once 10 watchlist symbols are selected", async ({
  page,
}) => {
  await mockLoggedOut(page);
  await page.goto("/auth/onboarding");

  // Step 1: Identity — display name is required to advance.
  await page.getByLabel("Display Name").fill("Alex Morgan");
  await page.getByRole("button", { name: /Continue to Starter Watchlist/i }).click();

  // Step 2: Starter Watchlist — 3 symbols (NVDA, AAPL, MSFT) are preselected.
  await expect(page.getByText(/^Selected: 3$/)).toBeVisible();

  // Add 7 custom symbols to reach the 10-symbol Free-plan cap exactly.
  for (const symbol of ["AMD", "PLTR", "GOOGL", "INTC", "BABA", "UBER", "SHOP"]) {
    await addCustomSymbol(page, symbol);
  }
  await expect(page.getByText(/^Selected: 10$/)).toBeVisible();
  await expect(
    page.getByText(/Free plan supports up to 10 watchlist symbols/i),
  ).not.toBeVisible();

  // 11th symbol — over the cap: rejected, inline warning shown, count stays at 10.
  await addCustomSymbol(page, "SNOW");
  await expect(
    page.getByText(/Free plan supports up to 10 watchlist symbols/i),
  ).toBeVisible();
  await expect(page.getByText(/^Selected: 10$/)).toBeVisible();
  await expect(page.getByText("SNOW", { exact: true })).not.toBeVisible();

  // Removing one clears the warning and frees up a slot.
  await page.locator("button").filter({ hasText: "AMD" }).first().click();
  await expect(
    page.getByText(/Free plan supports up to 10 watchlist symbols/i),
  ).not.toBeVisible();
  await expect(page.getByText(/^Selected: 9$/)).toBeVisible();
});
