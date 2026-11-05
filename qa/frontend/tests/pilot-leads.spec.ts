import { expect, test } from "@playwright/test";

const articleUrl = "http://127.0.0.1:3011/posts/frontend-qa-guide";

test.describe("Pilot published guide and lead form", () => {
  test("renders article content and sources, and the CTA focuses the request form", async ({ page }) => {
    await page.goto(articleUrl);

    await expect(page.getByRole("heading", { name: "Frontend QA guide: a synthetic stay in Da Nang" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "A practical guide" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
    await expect(page.getByRole("link", { name: "example.com" })).toHaveAttribute("href", "https://example.com/frontend-qa-source");

    await page.getByRole("button", { name: "Ask about a long stay" }).click();
    await expect(page.locator("#request")).toBeInViewport();
    await expect(page.getByLabel("Name")).toBeVisible();
  });

  test("requires contact consent before sending a lead", async ({ page }) => {
    await page.goto(articleUrl);
    await page.getByLabel("Name").fill("Frontend QA");
    await page.getByLabel("Email").fill("frontend@example.com");

    await expect(page.locator('input[name="consent"]')).toHaveAttribute("required", "");
    expect(await page.locator("form.lead-form").evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(false);
    await expect(page.getByRole("button", { name: "Send request" })).toBeEnabled();
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.locator("p.error")).toHaveCount(0);
  });

  test("shows success only after the server accepts the lead", async ({ page }) => {
    await page.goto(articleUrl);
    await page.getByLabel("Name").fill("Frontend QA");
    await page.getByLabel("Email").fill(`accepted-${Date.now()}@example.com`);
    await page.locator('input[name="consent"]').check();
    await page.getByRole("button", { name: "Send request" }).click();

    await expect(page.getByRole("status")).toHaveText("Thanks — TripC will reply to your email.");
    await expect(page.getByRole("button", { name: "Send request" })).toHaveCount(0);
  });

  test("shows server failure and allows a successful retry", async ({ page }) => {
    await page.goto(articleUrl);
    await page.getByLabel("Name").fill("Frontend QA retry");
    await page.getByLabel("Email").fill(`retry-${Date.now()}@example.com`);
    await page.locator('input[name="consent"]').check();
    await page.getByRole("button", { name: "Send request" }).click();

    await expect(page.locator("p.error")).toContainText("We could not send your request.");
    await expect(page.getByRole("status")).toHaveCount(0);

    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByRole("status")).toHaveText("Thanks — TripC will reply to your email.");
  });
});
