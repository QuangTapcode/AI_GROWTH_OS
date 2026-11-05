import { expect, test } from "@playwright/test";
import {
  approvedArtifactApproval,
  mockAuthenticatedApi,
  sampleArtifact,
} from "./support/api-mock";

test.describe("Artifact versioning and publishing gate", () => {
  test("saving an edited artifact creates a new version with the updated content", async ({ page }) => {
    const original = sampleArtifact();
    let createInput: Record<string, unknown> | undefined;
    await mockAuthenticatedApi(page, {
      handleRequest: (request, pathname) => {
        if (request.method() === "GET" && pathname.endsWith("/artifacts")) {
          return { body: { items: [original] } };
        }
        if (request.method() === "POST" && pathname.endsWith("/artifacts")) {
          const input = request.postDataJSON() as Record<string, unknown>;
          createInput = input;
          return {
            body: sampleArtifact({
              id: "artifact-frontend-2",
              version: 2,
              content_hash: String(input.content_hash),
              title: String(input.title),
              payload: input.payload,
            }),
          };
        }
        return undefined;
      },
    });
    await page.goto("/artifacts");
    await expect(page.getByRole("heading", { name: "Frontend QA content pack" }).last()).toBeVisible();
    await page.getByRole("button", { name: "Edit artifact", exact: true }).click();
    await page.getByLabel("ARTIFACT TITLE").fill("Revised frontend QA pack");
    await page.getByLabel("DOCUMENT CONTENT (MARKDOWN / TEXT)").fill("## Revised caption\nUpdated in a frontend test.");
    await page.getByRole("button", { name: "Save as v2", exact: true }).click();

    await expect(page.getByText(/Saved .* as version v2\./)).toBeVisible();
    if (!createInput) throw new Error("Artifact save request was not sent.");
    expect(createInput).toMatchObject({
      version: 2,
      title: "Revised frontend QA pack",
      payload: { document_markdown: "## Revised caption\nUpdated in a frontend test." },
    });
    expect(createInput?.content_hash).not.toBe(original.content_hash);
  });

  test("viewer cannot edit artifacts", async ({ page }) => {
    await mockAuthenticatedApi(page, {
      role: "viewer",
      handleRequest: (_request, pathname) => pathname.endsWith("/artifacts")
        ? { body: { items: [sampleArtifact()] } }
        : undefined,
    });
    await page.goto("/artifacts");

    await expect(page.getByRole("button", { name: "Edit artifact", exact: true })).toBeDisabled();
  });

  test("does not offer publishing when the approval is for a different version or hash", async ({ page }) => {
    const artifact = sampleArtifact();
    const staleApproval = approvedArtifactApproval(artifact, {
      target_version: 0,
      target_hash: "sha256-stale-content",
    });
    await mockAuthenticatedApi(page, {
      handleRequest: (_request, pathname) => {
        if (pathname.endsWith("/artifacts")) return { body: { items: [artifact] } };
        if (pathname.endsWith("/approvals")) return { body: { items: [staleApproval] } };
        if (pathname.endsWith("/channels")) return { body: { items: [{ id: "channel-1", workspace_id: artifact.workspace_id, platform_name: "website", channel_identifier: null, display_name: "TripC Website", created_at: "2026-11-05T00:00:00.000Z", publish_mode: "manual" }] } };
        return undefined;
      },
    });
    await page.goto("/distribution");

    await expect(page.getByText("Nothing approved yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Schedule", exact: true })).toHaveCount(0);
  });

  test("schedules an exactly approved artifact with the selected channel and campaign", async ({ page }) => {
    const artifact = sampleArtifact();
    const approval = approvedArtifactApproval(artifact);
    let scheduleInput: Record<string, unknown> | undefined;
    await mockAuthenticatedApi(page, {
      handleRequest: (request, pathname) => {
        if (request.method() === "GET" && pathname.endsWith("/artifacts")) return { body: { items: [artifact] } };
        if (request.method() === "GET" && pathname.endsWith("/approvals")) return { body: { items: [approval] } };
        if (request.method() === "GET" && pathname.endsWith("/channels")) {
          return { body: { items: [{ id: "channel-1", workspace_id: artifact.workspace_id, platform_name: "website", channel_identifier: null, display_name: "TripC Website", created_at: "2026-11-05T00:00:00.000Z", publish_mode: "manual" }] } };
        }
        if (request.method() === "POST" && pathname.endsWith("/publishing-jobs")) {
          scheduleInput = request.postDataJSON();
          return { body: { id: "job-1", channel_name: "TripC Website", platform_name: "website", mode: "manual" } };
        }
        return undefined;
      },
    });
    await page.goto("/distribution");
    await page.getByRole("button", { name: "Schedule", exact: true }).click();
    await page.getByPlaceholder("cv-seo-q4").fill("frontend-qa-campaign");
    await page.getByRole("button", { name: "Schedule", exact: true }).last().click();

    await expect(page.getByText(/Scheduled on TripC Website \(manual\)/)).toBeVisible();
    if (!scheduleInput) throw new Error("Publishing schedule request was not sent.");
    expect(scheduleInput).toMatchObject({
      artifact_id: artifact.id,
      channel_id: "channel-1",
      utm_campaign: "frontend-qa-campaign",
    });
    expect(Date.parse(String(scheduleInput.scheduled_for))).toBeGreaterThan(Date.now());
  });
});
