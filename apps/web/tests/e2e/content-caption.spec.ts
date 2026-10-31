import { expect, test } from "@playwright/test";
test.use({ channel: "chrome" });

test("Sandbox plan opens Content only after SEO approval and produces a complete caption", async ({ page, request }) => {
  test.setTimeout(60000);
  const auth = await request.post("http://localhost:4000/v1/auth/login", { data: { email: "owner.tripc.demo@gmail.com", password: "TripC@2026!" } });
  const login = await auth.json();
  const headers = { Authorization: `Bearer ${login.access_token}` };
  const base = "http://localhost:4000/v1/workspaces/10000000-0000-4000-8000-000000000001";
  const get = async (path: string) => (await (await request.get(`${base}/${path}`, { headers })).json());
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${base}/${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  };
  const waitArtifact = async (taskId: string) => {
    await expect.poll(async () => (await get("tasks")).items.find((task: { id: string }) => task.id === taskId)?.status, { timeout: 20000 }).toBe("awaiting_approval");
    return (await get("artifacts")).items.find((artifact: { task_id: string }) => artifact.task_id === taskId);
  };
  const approve = async (artifactId: string) => {
    const approval = (await get("approvals")).items.find((item: { target_id: string; status: string }) => item.target_id === artifactId && item.status === "pending");
    await post(`approvals/${approval.id}/review`, { decision: "approve", expected_version: approval.target_version, expected_hash: approval.target_hash, review_note: "Local synthetic Content integration test; no publication." });
  };
  const knowledge = await get("knowledge-contexts");
  const research = await post("ai-tasks", { synthetic: true, context_snapshot_id: knowledge.context.snapshot_id, input: { operation: "research.run" } });
  const researchArtifact = await waitArtifact(research.task_id);
  const strategy = await post("research-handoff", { research_artifact_id: researchArtifact.id, cta: "Ask TripC for the local living guide", deadline: new Date(Date.now() + 7 * 86400000).toISOString() });
  const plan = await waitArtifact(strategy.task_id);
  await approve(plan.id);
  const handoff = await post("seo-handoff", { plan_artifact_id: plan.id });
  const seoTask = handoff.tasks.find((task: { role: string }) => task.role === "seo");
  const contentTask = handoff.tasks.find((task: { role: string }) => task.role === "content");
  const article = await waitArtifact(seoTask.task_id);
  expect((await get("tasks")).items.find((task: { id: string }) => task.id === contentTask.task_id).status).toBe("pending");
  await approve(article.id);
  const content = await waitArtifact(contentTask.task_id);
  const result = content.payload.result;
  expect(result.caption).toContain("Ask TripC for the local living guide");
  expect(result.caption).toContain("\n\n");
  expect(result.hook).toBeTruthy();
  expect(result.key_points.length).toBeGreaterThan(0);
  expect(result.hashtags).toContain("#TripC");
  expect(result.parent_content_id).toBe(article.payload.result.article_id);
  expect(content.evidence.length).toBeGreaterThan(0);
  expect(result.synthetic).toBe(true);
  await page.addInitScript((session) => { localStorage.setItem("agos.session", JSON.stringify(session)); localStorage.setItem("agos.workspace", "10000000-0000-4000-8000-000000000001"); }, { token: login.access_token, expiresAt: login.expires_at, user: login.user });
  await page.goto("http://localhost:3000/agents/content");
  await expect(page.getByTestId("artifact-review-content")).toContainText(result.caption);
  await expect(page.getByRole("button", { name: "Sao chép caption", exact: true })).toBeVisible();
});
