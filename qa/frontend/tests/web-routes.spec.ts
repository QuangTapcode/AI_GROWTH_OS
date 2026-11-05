import { expect, test } from "@playwright/test";

const protectedRoutes = [
  { path: "/dashboard", title: "Overview" },
  { path: "/workflows", title: "Workflows & Tasks" },
  { path: "/review-queue", title: "Review Queue" },
  { path: "/artifacts", title: "Artifacts" },
  { path: "/distribution", title: "Distribution" },
  { path: "/growth-results", title: "Growth Results" },
  { path: "/workspace", title: "Workspace & Integrations" },
  { path: "/knowledge-contexts", title: "Knowledge Contexts" },
  { path: "/agents", title: "Agent Operations" },
  { path: "/agents/research", title: "Research & Trend" },
  { path: "/agents/growth_lead", title: "Growth Lead" },
  { path: "/agents/seo", title: "SEO Worker" },
  { path: "/agents/content", title: "Content Marketing" },
  { path: "/agents/community", title: "Community" },
  { path: "/agents/performance", title: "Performance" },
] as const;

test.describe("Web admin route coverage", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "agos.session",
        JSON.stringify({
          token: "frontend-route-test",
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          user: {
            id: "frontend-user",
            email: "owner.tripc.demo@gmail.com",
            full_name: "Frontend Test Owner",
          },
        }),
      );
    });

    await page.route("**/v1/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/auth/me")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user: {
              id: "frontend-user",
              email: "owner.tripc.demo@gmail.com",
              full_name: "Frontend Test Owner",
            },
            workspaces: [
              {
                workspace_id: "frontend-workspace",
                name: "TripC",
                slug: "tripc",
                role: "owner",
              },
            ],
          }),
        });
        return;
      }

      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "FRONTEND_TEST_DATA_UNAVAILABLE",
            message: "Frontend route coverage uses no live workspace data.",
            request_id: "frontend-route-test",
          },
        }),
      });
    });
  });

  for (const route of protectedRoutes) {
    test(`${route.path} renders its workspace page`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await page.goto(route.path);

      expect(new URL(page.url()).pathname).toBe(route.path);
      await expect(page.getByText(route.title, { exact: true }).first()).toBeVisible();
      await expect(page.getByText("AI Growth OS", { exact: true }).first()).toBeVisible();
      expect(pageErrors).toEqual([]);
    });
  }

  test("root redirects to the login page", async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("agos.session"));
    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("sidebar navigation opens the workflows page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Overview", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Workflows & Tasks", exact: true }).click();

    await expect(page).toHaveURL(/\/workflows$/);
    await expect(page.getByText("Workflows & Tasks", { exact: true }).first()).toBeVisible();
  });
});
