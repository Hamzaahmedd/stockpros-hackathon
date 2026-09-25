import { expect, test } from "@playwright/test";
import { mockLoggedIn, type MockUser } from "./mocks";

// Covers VerifyPhone.tsx (frontend/src/modules/auth/pages/VerifyPhone.tsx):
// phone-number validation (including local 03... input), OTP submission,
// error states, and the 60s resend-cooldown UI. All network calls are
// mocked — no real backend/SendPK traffic, per e2e/README.md.

const goToVerifyPhone = async (
  page: import("@playwright/test").Page,
  user: MockUser = {
    userId: "e2e-user-1",
    email: "e2e-user@example.com",
    displayName: "Alex Morgan",
    phoneVerifiedAt: null,
  },
) => {
  await mockLoggedIn(page, user);
  await page.goto("/auth/verify-phone");
  await expect(
    page.getByRole("heading", { name: /verify your phone/i }),
  ).toBeVisible();
  return user;
};

test("rejects a phone number that isn't a valid Pakistani mobile number", async ({
  page,
}) => {
  let requestCalled = false;
  await goToVerifyPhone(page);
  await page.route("**/api/v1/auth/phone-verification/request", (route) => {
    requestCalled = true;
    return route.fulfill({ status: 200, json: { success: true } });
  });

  await page.getByLabel("WhatsApp phone number").fill("12345");
  await page.getByRole("button", { name: /send verification code/i }).click();

  await expect(
    page.getByText(/valid pakistani mobile number/i),
  ).toBeVisible();
  expect(requestCalled).toBe(false);
});

test("accepts a local 03... number, normalizes it, and moves to the code stage", async ({
  page,
}) => {
  await goToVerifyPhone(page);

  let sentBody: unknown;
  await page.route("**/api/v1/auth/phone-verification/request", (route) => {
    sentBody = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      json: { success: true, message: "Verification code sent via WhatsApp." },
    });
  });

  await page.getByLabel("WhatsApp phone number").fill("03001234567");
  await page.getByRole("button", { name: /send verification code/i }).click();

  await expect(
    page.getByRole("heading", { name: /verify your phone/i }),
  ).toBeVisible();
  await expect(page.getByText(/\+923001234567/)).toBeVisible();
  await expect(page.getByLabel("Verification code")).toBeVisible();
  expect(sentBody).toEqual({ phoneNumber: "+923001234567" });
});

test("also accepts a +92... canonical number directly", async ({ page }) => {
  await goToVerifyPhone(page);

  let sentBody: unknown;
  await page.route("**/api/v1/auth/phone-verification/request", (route) => {
    sentBody = route.request().postDataJSON();
    return route.fulfill({ status: 200, json: { success: true } });
  });

  await page.getByLabel("WhatsApp phone number").fill("+923001234567");
  await page.getByRole("button", { name: /send verification code/i }).click();

  await expect(page.getByLabel("Verification code")).toBeVisible();
  expect(sentBody).toEqual({ phoneNumber: "+923001234567" });
});

test("shows an error toast when the OTP request fails", async ({ page }) => {
  await goToVerifyPhone(page);
  await page.route("**/api/v1/auth/phone-verification/request", (route) =>
    route.fulfill({
      status: 429,
      json: {
        success: false,
        message: "Please wait 60 seconds before requesting another code.",
      },
    }),
  );

  await page.getByLabel("WhatsApp phone number").fill("03001234567");
  await page.getByRole("button", { name: /send verification code/i }).click();

  await expect(
    page.getByText(/please wait 60 seconds before requesting another code/i),
  ).toBeVisible();
  // Still on the phone-entry stage — no code input rendered.
  await expect(page.getByLabel("WhatsApp phone number")).toBeVisible();
});

test("validates that the OTP code must be exactly 6 digits", async ({
  page,
}) => {
  await goToVerifyPhone(page);
  await page.route("**/api/v1/auth/phone-verification/request", (route) =>
    route.fulfill({ status: 200, json: { success: true } }),
  );

  await page.getByLabel("WhatsApp phone number").fill("03001234567");
  await page.getByRole("button", { name: /send verification code/i }).click();
  await expect(page.getByLabel("Verification code")).toBeVisible();

  let verifyCalled = false;
  await page.route("**/api/v1/auth/phone-verification/verify", (route) => {
    verifyCalled = true;
    return route.fulfill({ status: 200, json: { success: true } });
  });

  await page.getByLabel("Verification code").fill("123");
  await page.getByRole("button", { name: /^verify$/i }).click();

  await expect(
    page.getByText(/enter the 6-digit code sent to your whatsapp/i),
  ).toBeVisible();
  expect(verifyCalled).toBe(false);
});

test("shows an error toast for an incorrect or expired code", async ({
  page,
}) => {
  await goToVerifyPhone(page);
  await page.route("**/api/v1/auth/phone-verification/request", (route) =>
    route.fulfill({ status: 200, json: { success: true } }),
  );
  await page.getByLabel("WhatsApp phone number").fill("03001234567");
  await page.getByRole("button", { name: /send verification code/i }).click();
  await expect(page.getByLabel("Verification code")).toBeVisible();

  await page.route("**/api/v1/auth/phone-verification/verify", (route) =>
    route.fulfill({
      status: 401,
      json: { success: false, message: "Incorrect verification code" },
    }),
  );

  await page.getByLabel("Verification code").fill("000000");
  await page.getByRole("button", { name: /^verify$/i }).click();

  await expect(page.getByText(/incorrect verification code/i)).toBeVisible();
  // Still on the OTP stage.
  await expect(page.getByLabel("Verification code")).toBeVisible();
});

test("verifies successfully and navigates to the dashboard", async ({
  page,
}) => {
  const user = await goToVerifyPhone(page);
  await page.route("**/api/v1/auth/phone-verification/request", (route) =>
    route.fulfill({ status: 200, json: { success: true } }),
  );
  await page.getByLabel("WhatsApp phone number").fill("03001234567");
  await page.getByRole("button", { name: /send verification code/i }).click();
  await expect(page.getByLabel("Verification code")).toBeVisible();

  await page.route("**/api/v1/auth/phone-verification/verify", (route) => {
    user.phoneVerifiedAt = new Date().toISOString();
    return route.fulfill({ status: 200, json: { success: true } });
  });

  await page.getByLabel("Verification code").fill("123456");
  await page.getByRole("button", { name: /^verify$/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
});

test("60-second resend cooldown disables resend and re-enables after it elapses", async ({
  page,
}) => {
  // Install fake timers before navigating so the component's setInterval
  // countdown is driven by the clock we control.
  await page.clock.install();

  let requestCount = 0;
  await goToVerifyPhone(page);
  await page.route("**/api/v1/auth/phone-verification/request", (route) => {
    requestCount += 1;
    return route.fulfill({ status: 200, json: { success: true } });
  });

  await page.getByLabel("WhatsApp phone number").fill("03001234567");
  await page.getByRole("button", { name: /send verification code/i }).click();
  await expect(page.getByLabel("Verification code")).toBeVisible();
  expect(requestCount).toBe(1);

  const resendButton = page.getByRole("button", { name: /resend code/i });
  await expect(resendButton).toBeDisabled();
  await expect(resendButton).toHaveText(/resend code in 60s/i);

  // Clicking while still within the cooldown must not fire another request.
  await resendButton.click({ force: true });
  expect(requestCount).toBe(1);

  // runFor (not fastForward) so the countdown's setInterval actually fires
  // on every 1s tick in between, the same way it would in real time.
  await page.clock.runFor(60_000);

  await expect(resendButton).toBeEnabled();
  await expect(resendButton).toHaveText(/^resend code$/i);

  await resendButton.click();
  expect(requestCount).toBe(2);
});
