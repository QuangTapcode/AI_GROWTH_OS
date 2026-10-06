import { expect, test } from "@playwright/test";

for (const [name, port] of [["pilot", 3001], ["web", 3000]] as const) {
  test(`${name} connects to the live API and recovers after a connection failure`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = page.waitForResponse("http://localhost:4000/v1/health");
    await page.goto(`http://localhost:${port}`);
    expect((await response).status()).toBe(200);
    await expect(page.getByRole("status")).toHaveText("API connected");

    await page.route("http://localhost:4000/v1/health", (route) => route.abort());
    await page.getByRole("button", { name: "Check again" }).click();
    await expect(page.getByRole("status")).toHaveText("API unavailable");
    await page.unroute("http://localhost:4000/v1/health");
    await page.getByRole("button", { name: "Check again" }).click();
    await expect(page.getByRole("status")).toHaveText("API connected");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

