import { expect, test } from "@playwright/test";
import { mockAuthenticatedApi } from "./support/api-mock";

test("workflows show an API error and recover when retry succeeds", async ({ page }) => {
  let taskFailuresEnabled = true;
  await mockAuthenticatedApi(page, {
    handleRequest: (request, pathname) => {
      if (request.method() === "GET" && /\/workspaces\/frontend-workspace\/tasks$/.test(pathname)) {
        if (taskFailuresEnabled) {
          return {
            status: 503,
            body: {
              error: {
                code: "TEMPORARY_FAILURE",
                message: "Synthetic frontend test outage.",
                request_id: "frontend-retry",
              },
            },
          };
        }
      }
      return undefined;
    },
  });
  await page.goto("/workflows");

  await expect(page.getByText("Could not load data from the API")).toBeVisible();
  await expect(page.getByText(/Synthetic frontend test outage/)).toBeVisible();
  taskFailuresEnabled = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();

  await expect(page.getByText("No AI runs yet", { exact: true })).toBeVisible();
});
