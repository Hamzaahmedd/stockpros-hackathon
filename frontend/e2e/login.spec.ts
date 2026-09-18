import { expect, test } from "@playwright/test";
import { mockLoggedOut } from "./mocks";

test("login page renders the magic-link form with no console errors", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await mockLoggedOut(page);
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: /sign in to stockpros/i }),
  ).toBeVisible();
  await expect(page.getByLabel("Email Address")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /continue with email/i }),
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
