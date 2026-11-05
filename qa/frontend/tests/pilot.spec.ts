import { expect, test } from "@playwright/test";

test("pilot home displays the TripC guides landing page", async ({ page }) => {
  await page.goto("http://127.0.0.1:3011");

  await expect(page.getByRole("heading", { name: "Your next chapter in Da Nang." })).toBeVisible();
  const guides = page.locator('section[aria-labelledby="guides"]');
  await expect(guides).toBeVisible();
  const hasPublishedGuides = (await guides.getByRole("link").count()) > 0;
  const showsEmptyState = (await guides.getByText("No guides are published yet.").count()) > 0;
  expect(hasPublishedGuides || showsEmptyState).toBe(true);
});

test("pilot returns not found for an unpublished guide", async ({ page }) => {
  const response = await page.goto("http://127.0.0.1:3011/posts/frontend-qa-missing-guide");

  expect(response?.status()).toBe(404);
});
