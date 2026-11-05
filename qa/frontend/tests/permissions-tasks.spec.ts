import { expect, test } from "@playwright/test";
import { mockAuthenticatedApi } from "./support/api-mock";

test.describe("Workspace permissions and task creation", () => {
  test("viewer cannot submit a new workflow task", async ({ page }) => {
    await mockAuthenticatedApi(page, { role: "viewer" });
    await page.goto("/workflows");

    await expect(page.getByRole("button", { name: "New AI run", exact: true })).toBeDisabled();
  });

  test("owner can create a task and the API receives the form values", async ({ page }) => {
    let createdTask: Record<string, unknown> | undefined;
    await mockAuthenticatedApi(page, {
      handleRequest: (request, pathname) => {
        if (request.method() === "POST" && /\/workspaces\/frontend-workspace\/tasks$/.test(pathname)) {
          createdTask = request.postDataJSON();
        }
        return undefined;
      },
    });
    await page.goto("/workflows");
    await page.getByRole("button", { name: "New AI run", exact: true }).click();
    await page.getByLabel("Title").fill("Frontend QA synthetic task");
    await page.getByLabel("Description").fill("Verify that the task form submits a title and description.");
    await page.getByRole("button", { name: "Create task", exact: true }).click();

    await expect(page.getByText(/Task created and queued: Frontend QA synthetic task/)).toBeVisible();
    expect(createdTask).toMatchObject({
      role: "research",
      operation: "research.run",
      payload: {
        title: "Frontend QA synthetic task",
        description: "Verify that the task form submits a title and description.",
      },
    });
  });

  test("viewer cannot edit a workspace business profile", async ({ page }) => {
    await mockAuthenticatedApi(page, { role: "viewer" });
    await page.goto("/workspace");
    await expect(page.getByRole("heading", { name: "Workspace & Integrations" })).toBeVisible();

    await expect(page.getByRole("button", { name: "Edit profile", exact: true })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Growth Knowledge · Business profile" })).toBeVisible();
  });

  test("owner saves profile changes with the current version and normalized lists", async ({ page }) => {
    let update: Record<string, unknown> | undefined;
    await mockAuthenticatedApi(page, {
      handleRequest: (request, pathname) => {
        if (request.method() === "PUT" && pathname.endsWith("/business-profile")) {
          update = request.postDataJSON();
          return {
            body: {
              id: "profile-1",
              workspace_id: "frontend-workspace",
              company_name: String(update.company_name),
              website_url: update.website_url,
              industry: update.industry,
              overview: update.overview,
              safety_rules: {},
              target_locations: update.target_locations,
              target_audiences: update.target_audiences,
              products_services: update.products_services,
              brand_voice: update.brand_voice,
              brand_guidelines: update.brand_guidelines,
              competitors: update.competitors,
              research_strategy: null,
              version: 2,
              updated_by: "frontend-qa-user",
              updated_at: "2026-11-05T00:00:00.000Z",
            },
          };
        }
        return undefined;
      },
    });
    await page.goto("/workspace");
    await page.getByRole("button", { name: "Edit profile", exact: true }).click();
    await page.getByLabel("Company", { exact: true }).fill("TripC Frontend QA");
    await page.getByLabel("Target locations (comma separated)").fill("Da Nang, Hoi An");
    await page.getByRole("button", { name: "Save as version 2", exact: true }).click();

    await expect(page.getByText("Business profile saved as version 2.")).toBeVisible();
    expect(update).toMatchObject({
      expected_version: 1,
      company_name: "TripC Frontend QA",
      target_locations: ["Da Nang", "Hoi An"],
    });
  });
});
