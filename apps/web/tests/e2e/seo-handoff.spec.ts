import { expect, test } from "@playwright/test";
test.use({ channel: "chrome" });

test("Approved Growth Lead plan creates SEO once, pins sources and waits for article review", async ({ page, request }) => {
  const response = await request.post("http://localhost:4000/v1/auth/login", { data: { email: "owner.tripc.demo@gmail.com", password: "TripC@2026!" } });
  const login = await response.json();
  const headers = { Authorization: `Bearer ${login.access_token}` };
  const base = "http://localhost:4000/v1/workspaces/10000000-0000-4000-8000-000000000001";
  const load = async (path: string) => (await (await request.get(`${base}/${path}`, { headers })).json()).items;
  const artifacts = await load("artifacts");
  const approvals = await load("approvals");
  const plan = artifacts.find((artifact: { id: string; operation: string }) => artifact.operation === "strategy.generate" && approvals.some((approval: { target_id: string; status: string }) => approval.target_id === artifact.id && approval.status === "approved"));
  expect(plan, "A user-approved Growth Lead plan must exist").toBeTruthy();
  const unapproved = artifacts.find((artifact: { id: string; operation: string }) => artifact.operation === "strategy.generate" && !approvals.some((approval: { target_id: string; status: string }) => approval.target_id === artifact.id && approval.status === "approved"));
  if (unapproved) {
    const denied = await request.post(`${base}/seo-handoff`, { headers, data: { plan_artifact_id: unapproved.id } });
    expect(denied.status()).toBe(409);
  }
  await page.addInitScript((session) => { localStorage.setItem("agos.session", JSON.stringify(session)); localStorage.setItem("agos.workspace", "10000000-0000-4000-8000-000000000001"); }, { token: login.access_token, expiresAt: login.expires_at, user: login.user });
  await page.goto("http://localhost:3000/agents/seo");
  await page.getByLabel("Kế hoạch Growth Lead", { exact: true }).selectOption(plan.id);
  const acceptResponse = page.waitForResponse((response) => response.url().endsWith("/seo-handoff"));
  await page.getByRole("button", { name: "Bàn giao và chạy SEO", exact: true }).click();
  const accepted = await acceptResponse;
  expect([200, 201]).toContain(accepted.status());
  const handoff = await accepted.json();
  const seo = handoff.tasks.find((task: { role: string }) => task.role === "seo");
  const content = handoff.tasks.find((task: { role: string }) => task.role === "content");
  const replay = await request.post(`${base}/seo-handoff`, { headers, data: { plan_artifact_id: plan.id } });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).deduplicated).toBe(true);
  await expect.poll(async () => (await load("tasks")).find((task: { id: string }) => task.id === seo.task_id)?.status, { timeout: 20000 }).toBe("awaiting_approval");
  expect((await load("tasks")).find((task: { id: string }) => task.id === content.task_id).status).toBe("pending");
  const article = (await load("artifacts")).find((artifact: { task_id: string }) => artifact.task_id === seo.task_id);
  expect(article.payload.result.title).toBeTruthy();
  expect(article.payload.result.meta_description).toBeTruthy();
  expect(article.payload.result.body_markdown).toBeTruthy();
  expect(article.evidence.length).toBeGreaterThan(0);
  expect(article.context_snapshot_id).toBe(plan.context_snapshot_id);
  expect((await load("approvals")).some((approval: { target_id: string; status: string }) => approval.target_id === article.id && approval.status === "pending")).toBe(true);
  await expect(page.getByTestId("artifact-review-content")).toContainText(article.payload.result.title, { timeout: 15000 });
});
