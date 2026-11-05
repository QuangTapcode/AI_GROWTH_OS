import { expect, test } from "@playwright/test";
import { mockAuthenticatedApi, pendingTaskApproval } from "./support/api-mock";

test.describe("Review queue", () => {
  test("shows the empty state when there are no approvals", async ({ page }) => {
    await mockAuthenticatedApi(page);
    await page.goto("/review-queue");

    await expect(page.getByText("Nothing to review")).toBeVisible();
    await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
  });

  test("viewer can inspect a pending approval but cannot decide it", async ({ page }) => {
    const approval = pendingTaskApproval();
    await mockAuthenticatedApi(page, {
      role: "viewer",
      handleRequest: (_request, pathname) => {
        if (pathname.endsWith("/approvals")) return { body: { items: [approval] } };
        return undefined;
      },
    });
    await page.goto("/review-queue");

    await expect(page.getByText("Only workspace owners can approve or reject AI outputs.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Reject/ })).toHaveCount(0);
  });

  test("owner approval submits the pinned version and hash", async ({ page }) => {
    const approval = pendingTaskApproval();
    let decision: Record<string, unknown> | undefined;
    await mockAuthenticatedApi(page, {
      handleRequest: (request, pathname) => {
        if (request.method() === "GET" && pathname.endsWith("/approvals")) {
          return { body: { items: [approval] } };
        }
        if (request.method() === "POST" && pathname.endsWith(`/approvals/${approval.id}/review`)) {
          decision = request.postDataJSON();
        }
        return undefined;
      },
    });
    await page.goto("/review-queue");

    await expect(page.getByRole("button", { name: "✓ Approve", exact: true })).toBeVisible();
    await page.getByPlaceholder(/Review note/).fill("Reviewed in the frontend suite.");
    await page.getByRole("button", { name: "✓ Approve", exact: true }).click();

    await expect(page.getByText("Approved. The decision is recorded in the approval ledger.")).toBeVisible();
    expect(decision).toEqual({
      decision: "approve",
      expected_version: 2,
      expected_hash: "sha256-frontend-qa-hash",
      review_note: "Reviewed in the frontend suite.",
    });
  });

  test("surfaces stale approval conflicts instead of showing success", async ({ page }) => {
    const approval = pendingTaskApproval();
    await mockAuthenticatedApi(page, {
      handleRequest: (request, pathname) => {
        if (request.method() === "GET" && pathname.endsWith("/approvals")) {
          return { body: { items: [approval] } };
        }
        if (request.method() === "POST" && pathname.endsWith(`/approvals/${approval.id}/review`)) {
          return {
            status: 409,
            body: {
              error: {
                code: "VERSION_CONFLICT",
                message: "Approval target changed.",
                request_id: "frontend-stale-approval",
              },
            },
          };
        }
        return undefined;
      },
    });
    await page.goto("/review-queue");
    await page.getByRole("button", { name: "✓ Approve", exact: true }).click();

    await expect(page.getByText(/Approval target changed\. \(VERSION_CONFLICT\)/)).toBeVisible();
    await expect(page.getByText("Approved. The decision is recorded in the approval ledger.")).toHaveCount(0);
  });

  test("saves a rejection note with the rejection decision", async ({ page }) => {
    const approval = pendingTaskApproval();
    let decision: Record<string, unknown> | undefined;
    await mockAuthenticatedApi(page, {
      handleRequest: (request, pathname) => {
        if (request.method() === "GET" && pathname.endsWith("/approvals")) {
          return { body: { items: [approval] } };
        }
        if (request.method() === "POST" && pathname.endsWith(`/approvals/${approval.id}/review`)) {
          decision = request.postDataJSON();
        }
        return undefined;
      },
    });
    await page.goto("/review-queue");
    await page.getByPlaceholder(/Review note/).fill("Please add source evidence.");
    await page.getByRole("button", { name: "✕ Reject", exact: true }).click();

    await expect(page.getByText("Rejected. Your feedback is saved with the approval.")).toBeVisible();
    expect(decision).toMatchObject({
      decision: "reject",
      expected_version: 2,
      expected_hash: "sha256-frontend-qa-hash",
      review_note: "Please add source evidence.",
    });
  });
});
