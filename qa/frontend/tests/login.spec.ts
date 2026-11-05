import { expect, test } from "@playwright/test";

test.describe("Web admin login", () => {
  test("opens the login page with email and password fields", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  });

  test("rejects a non-Gmail address without calling the API", async ({ page }) => {
    let loginRequests = 0;
    await page.route("**/v1/auth/login", async (route) => {
      loginRequests++;
      await route.fulfill({ status: 401, body: "{}" });
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill("person@example.com");
    await page.getByLabel("Password").fill("test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByText("Vui lòng nhập đúng định dạng Gmail", { exact: false })).toBeVisible();
    expect(loginRequests).toBe(0);
  });

  test("shows the API's invalid-credentials message", async ({ page }) => {
    let submittedEmail: string | undefined;
    await page.route("**/v1/auth/login", async (route) => {
      submittedEmail = route.request().postDataJSON().email;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
            request_id: "frontend-test",
          },
        }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill("person@gmail.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByText("Email hoặc mật khẩu không đúng")).toBeVisible();
    expect(submittedEmail).toBe("person@gmail.com");
  });
});
