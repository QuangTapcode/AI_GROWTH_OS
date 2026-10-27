import { expect, test } from "@playwright/test";
test.use({ channel: "chrome" });

test("Review Queue renders each agent output as readable content", async ({ page, request }) => {
  const response = await request.post("http://localhost:4000/v1/auth/login", { data: { email: "owner.tripc.demo@gmail.com", password: "TripC@2026!" } });
  const login = await response.json();
  await page.addInitScript((session) => {
    localStorage.setItem("agos.session", JSON.stringify(session));
    localStorage.setItem("agos.workspace", "10000000-0000-4000-8000-000000000001");
  }, { token: login.access_token, expiresAt: login.expires_at, user: login.user });
  const fixtures = [
    ["research", { findings: [{ topic: "Housing opportunities", user_need: "Find a home", evidence: { quote: "Approved housing evidence" } }] }, "Housing opportunities"],
    ["growth_lead", { objective: "Grow qualified housing enquiries", tasks: [{ role: "seo", brief: { topic: "Rental checklist" } }] }, "Grow qualified housing enquiries"],
    ["seo", { title: "Da Nang guide", body_markdown: "Readable SEO article body", seo_checks: { grounded: true } }, "Readable SEO article body"],
    ["content", { caption: "Find your next home with TripC", cta: "Read our guide", channels: ["facebook"] }, "Find your next home with TripC"],
    ["community", { reply: "We can help with housing guidance", lead_proposal: null }, "We can help with housing guidance"],
    ["performance", { metrics: { clicks: 0, leads: null }, observations: ["No click activity in this window"] }, "No click activity in this window"],
  ] as const;
  for (const [role, result, expected] of fixtures) {
    const artifact = { id: "artifact-preview", workspace_id: "10000000-0000-4000-8000-000000000001", task_id: null, role, operation: role === "community" ? "community.response" : `${role}.run`, title: role, artifact_type: "ai_result", version: 1, content_hash: "a".repeat(64), created_at: new Date().toISOString(), payload: { result: { ...result, status: "draft", missing_facts: [], synthetic: true } }, evidence: [{ quote: "Verified source quote", source_url: "https://example.com/source" }] };
    await page.route("**/v1/workspaces/*/artifacts", (route) => route.fulfill({ json: { items: [artifact] } }));
    await page.route("**/v1/workspaces/*/approvals", (route) => route.fulfill({ json: { items: [{ id: "approval-preview", workspace_id: artifact.workspace_id, target_id: artifact.id, target_type: "artifact", target_version: 1, target_hash: artifact.content_hash, status: "pending", created_at: artifact.created_at, updated_at: artifact.created_at }] } }));
    await page.goto("http://localhost:3000/review-queue");
    const preview = page.getByTestId("artifact-review-content");
    await expect(preview).toContainText(expected);
    await expect(preview).toContainText("Verified source quote");
    await expect(preview).not.toContainText("The agent did not provide a summary");
    await page.getByRole("button", { name: "Phóng to kết quả", exact: true }).click();
    const expanded = page.getByRole("dialog");
    await expect(expanded).toBeVisible();
    await expect(expanded).toContainText(expected);
    await expect(expanded).not.toContainText('"target_hash"');
    await page.keyboard.press("Escape");
    await expect(expanded).toHaveCount(0);
    if (role === "performance") { await expect(preview).toContainText("0"); await expect(preview).toContainText("Chưa có dữ liệu"); }
    await page.unroute("**/v1/workspaces/*/artifacts");
    await page.unroute("**/v1/workspaces/*/approvals");
  }
});
