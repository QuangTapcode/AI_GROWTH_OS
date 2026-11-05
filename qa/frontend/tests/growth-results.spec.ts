import { expect, test } from "@playwright/test";
import { mockAuthenticatedApi } from "./support/api-mock";

test("growth results show missing analytics as unavailable rather than zero", async ({ page }) => {
  await mockAuthenticatedApi(page, {
    handleRequest: (request, pathname) => {
      if (request.method() === "GET" && pathname.endsWith("/reports")) {
        return {
          body: {
            workspace_id: "frontend-workspace",
            period: { from: "2026-11-01", to: "2026-11-05", timezone: "Asia/Ho_Chi_Minh", currency: "VND" },
            kpis: {
              sessions: { metric: "sessions", value: null, availability: "missing", missing_reason: "NO_DATA_IN_RANGE" },
              leads_generated: { metric: "leads_generated", value: 0, availability: "available", missing_reason: null },
            },
            summary: { total_leads: 0, available_kpi_count: 1, missing_kpi_count: 1 },
            generated_at: "2026-11-05T00:00:00.000Z",
          },
        };
      }
      return undefined;
    },
  });
  await page.goto("/growth-results");

  await expect(page.getByRole("heading", { name: "Growth Results" })).toBeVisible();
  await expect(page.getByText("No traffic data", { exact: true })).toBeVisible();
  await expect(page.getByText("No leads yet.", { exact: true }).first()).toBeVisible();
  const sessionsCard = page.getByText("Sessions", { exact: true }).locator("xpath=../..");
  await expect(sessionsCard.getByText("—", { exact: true })).toBeVisible();
  await expect(sessionsCard.getByText("No data in range", { exact: true })).toBeVisible();
  const leadsCard = page.getByText("Qualified Leads", { exact: true }).locator("xpath=../..");
  await expect(leadsCard.getByText("0", { exact: true })).toBeVisible();
});

test("changing report period reloads growth metrics for the selected range", async ({ page }) => {
  const requestedReportUrls: string[] = [];
  await mockAuthenticatedApi(page, {
    handleRequest: (request, pathname) => {
      if (request.method() === "GET" && pathname.endsWith("/reports")) {
        requestedReportUrls.push(request.url());
      }
      return undefined;
    },
  });
  await page.goto("/growth-results");
  await expect(page.getByRole("heading", { name: "Growth Results" })).toBeVisible();

  await page.getByLabel("Report period").selectOption("7");

  await expect.poll(() => requestedReportUrls.length).toBeGreaterThan(2);
  const selectedRanges = requestedReportUrls.slice(-2).map((url) => {
    const params = new URL(url).searchParams;
    return { from: params.get("from"), to: params.get("to") };
  });
  expect(selectedRanges).toHaveLength(2);
  for (const range of selectedRanges) {
    expect(range.from).not.toBeNull();
    expect(range.to).not.toBeNull();
    const days = (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000;
    expect(days).toBe(6);
  }
});
