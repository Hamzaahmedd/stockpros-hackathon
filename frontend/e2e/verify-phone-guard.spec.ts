import { expect, test } from "@playwright/test";
import { mockLoggedIn, mockLoggedOut } from "./mocks";

// Covers VerifyPhoneGuard (frontend/src/modules/auth/components/VerifyPhoneGuard.tsx),
// mounted at /auth/verify-phone in App.tsx. Every case is driven purely by
// mocked network responses — no real backend/DB, per e2e/README.md.

test("redirects to /login when there is no authenticated session", async ({
  page,
}) => {
  await mockLoggedOut(page);
  await page.goto("/auth/verify-phone");

  await expect(page).toHaveURL(/\/login$/);
});

test("redirects to /auth/onboarding when the phone is already verified but the profile has no display name", async ({
  page,
}) => {
  await mockLoggedIn(page, {
    userId: "e2e-user-1",
    email: "e2e-user@example.com",
    displayName: "",
    phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
  });

  await page.goto("/auth/verify-phone");

  await expect(page).toHaveURL(/\/auth\/onboarding$/);
});

test("redirects to /dashboard when the phone is already verified and onboarding is complete", async ({
  page,
}) => {
  await mockLoggedIn(page, {
    userId: "e2e-user-1",
    email: "e2e-user@example.com",
    displayName: "Alex Morgan",
    phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
  });

  await page.goto("/auth/verify-phone");

  await expect(page).toHaveURL(/\/dashboard$/);
});

test("renders the verify-phone form when authenticated and phone is not yet verified", async ({
  page,
}) => {
  await mockLoggedIn(page, {
    userId: "e2e-user-1",
    email: "e2e-user@example.com",
    displayName: "Alex Morgan",
    phoneVerifiedAt: null,
  });

  await page.goto("/auth/verify-phone");

  await expect(page).toHaveURL(/\/auth\/verify-phone$/);
  await expect(
    page.getByRole("heading", { name: /verify your phone/i }),
  ).toBeVisible();
  await expect(page.getByLabel("WhatsApp phone number")).toBeVisible();
});
