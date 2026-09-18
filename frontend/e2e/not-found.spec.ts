import { expect, test } from "@playwright/test";
import { mockLoggedOut } from "./mocks";

test("unknown route renders the 404 page and links back to login", async ({
  page,
}) => {
  await mockLoggedOut(page);
  await page.goto("/this-route-does-not-exist");

  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

  const backLink = page.getByRole("link", { name: /back to login/i });
  await expect(backLink).toBeVisible();

  await backLink.click();
  await expect(page).toHaveURL(/\/login$/);
});
