import { expect, test } from "@playwright/test";
import { demoSession, mockAuthenticatedApi } from "./support/api-mock";

test.describe("Session and workspace behavior", () => {
  test("redirects unauthenticated users to login with a safe return path", async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("agos.session"));
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("clears an expired session and requires login", async ({ page }) => {
    await page.addInitScript((session) => {
      localStorage.setItem("agos.session", JSON.stringify({
        ...session,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }));
    }, demoSession);
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    expect(await page.evaluate(() => localStorage.getItem("agos.session"))).toBeNull();
  });

  test("stores a successful login session and opens the dashboard", async ({ page }) => {
    await mockAuthenticatedApi(page, {
      initializeSession: false,
      handleRequest: (request, pathname) => {
        if (request.method() === "POST" && pathname.endsWith("/auth/login")) {
          return {
            body: {
              access_token: "successful-frontend-token",
              token_type: "Bearer",
              expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
              user: demoSession.user,
            },
          };
        }
        return undefined;
      },
    });

    await page.goto("/login?next=//external.example");
    await page.getByLabel("Email").fill("owner.tripc.demo@gmail.com");
    await page.getByLabel("Password").fill("synthetic-test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("agos.session") ?? "null"));
    expect(stored.token).toBe("successful-frontend-token");
  });

  test("logout clears the browser session and returns to login", async ({ page }) => {
    await mockAuthenticatedApi(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    await page.getByTitle("Logout").click();

    await expect(page).toHaveURL(/\/login$/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("agos.session"))).toBeNull();
  });

  test("switches workspaces and remembers the selection", async ({ page }) => {
    await mockAuthenticatedApi(page, {
      workspaces: [
        { workspace_id: "frontend-workspace", name: "TripC", slug: "tripc", role: "owner" },
        { workspace_id: "second-workspace", name: "Hoi An Homes", slug: "hoi-an", role: "editor" },
      ],
    });
    await page.goto("/dashboard");

    await page.getByRole("button").filter({ hasText: "TripC" }).first().click();
    await page.getByRole("button").filter({ hasText: "Hoi An Homes" }).click();

    await expect(page.getByText("Hoi An Homes", { exact: true }).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("agos.workspace"))).toBe("second-workspace");
    await page.reload();
    await expect(page.getByText("Hoi An Homes", { exact: true }).first()).toBeVisible();
  });

  test("clears the session when the API rejects an expired token", async ({ page }) => {
    await mockAuthenticatedApi(page, {
      initializeSession: false,
      handleRequest: (request, pathname) => {
        if (request.method() === "GET" && pathname.endsWith("/auth/me")) {
          return {
            status: 401,
            body: {
              error: {
                code: "SESSION_REVOKED",
                message: "Session revoked.",
                request_id: "frontend-expired-token",
              },
            },
          };
        }
        return undefined;
      },
    });
    await page.goto("/login");
    await page.evaluate((session) => localStorage.setItem("agos.session", JSON.stringify(session)), demoSession);
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    expect(await page.evaluate(() => localStorage.getItem("agos.session"))).toBeNull();
  });
});
