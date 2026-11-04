import { expect, test, type Page } from "@playwright/test";
test.use({ channel: "chrome" });

const WS = "10000000-0000-4000-8000-000000000001";
const QUOTE = "An Thuong is popular with newcomers for its cafes.";
const URL = "https://tripc.ai/blog/an-thuong-guide";

const content = {
  caption: "An Thuong guide", cta: "Ask TripC", channels: ["facebook"], status: "draft", missing_facts: [],
  facebook: { text: "Where do newcomers start?\n\nAn Thuong has many cafes.\n\nAsk TripC" },
  extracted_facts: [{ fact_id: "f01", text: QUOTE, source_type: "citation", source_url: URL }],
  sentence_fact_map: [
    { sentence_index: 0, text: "Where do newcomers start?", sentence_type: "hook", fact_id: "NONE", entailment_status: "supported" },
    { sentence_index: 1, text: "An Thuong has many cafes.", sentence_type: "factual", fact_id: ["f01"], entailment_status: "supported" },
    { sentence_index: 2, text: "Rents there fell last year.", sentence_type: "factual", fact_id: ["f_unmapped"], entailment_status: "unsupported" },
    { sentence_index: 3, text: "Ask TripC", sentence_type: "cta", fact_id: "SYSTEM_CTA", entailment_status: "supported" },
  ],
};

async function review(page: Page, request: Parameters<Parameters<typeof test>[2]>[0]["request"], role: string, operation: string, result: unknown, path = "/review-queue") {
  const login = await (await request.post("http://localhost:4000/v1/auth/login", { data: { email: "owner.tripc.demo@gmail.com", password: "TripC@2026!" } })).json();
  await page.addInitScript((session) => {
    localStorage.setItem("agos.session", JSON.stringify(session));
    localStorage.setItem("agos.workspace", "10000000-0000-4000-8000-000000000001");
  }, { token: login.access_token, expiresAt: login.expires_at, user: login.user });
  const artifact = { id: "artifact-preview", workspace_id: WS, task_id: null, role, operation, title: role, artifact_type: "ai_result", version: 1,
    content_hash: "a".repeat(64), context_snapshot_id: null, created_at: "2026-11-03T00:00:00.000Z", payload: { result }, evidence: [] };
  await page.route("**/v1/workspaces/*/artifacts", (route) => route.fulfill({ json: { items: [artifact] } }));
  await page.route("**/v1/workspaces/*/approvals", (route) => route.fulfill({ json: { items: [{ id: "approval-preview", workspace_id: WS, target_id: artifact.id, target_type: "artifact", target_version: 1, target_hash: artifact.content_hash, status: "pending", created_at: artifact.created_at, updated_at: artifact.created_at }] } }));
  await page.goto(`http://localhost:3000${path}`);
  return page.getByTestId("artifact-review-content");
}

test("A reviewer sees the source quote behind each sentence and which sentences have none", async ({ page, request }) => {
  const preview = await review(page, request, "content", "content.repurpose", content);
  const rows = page.getByTestId("sentence-source");
  await expect(rows).toHaveCount(4);
  const grounded = rows.filter({ hasText: "An Thuong has many cafes." });
  await expect(grounded).toContainText(QUOTE);
  await expect(grounded.getByRole("link")).toHaveAttribute("href", URL);
  await expect(rows.filter({ hasText: "Rents there fell last year." })).toContainText("Chưa có nguồn");
  await expect(rows.filter({ hasText: "Where do newcomers start?" })).toContainText("Câu mở đầu");
  await expect(rows.filter({ hasText: "Ask TripC" })).toContainText("Kêu gọi hành động");
  // Matching is by shared words: "có nguồn" must not read as "đúng".
  await expect(preview).toContainText("vẫn cần đọc trích dẫn");
});

test("A reviewer sees the TikTok script, its length problem and the image suggestion", async ({ page, request }) => {
  const preview = await review(page, request, "content", "content.repurpose", { ...content,
    tiktok: { hook: "New to Da Nang?", scenes: [{ voiceover: "Cafes in An Thuong have fast Wi-Fi.", visual: "Laptop on a cafe table" }], cta: "Ask TripC", word_count: 75, within_length: false },
    image_suggestion: { status: "draft", prompt: "peaceful modern workspace, green plants", negative_prompt: "text, logo", aspect_ratio: "1:1", reason: null } });
  await expect(preview).toContainText("Kịch bản TikTok");
  await expect(preview).toContainText("Cafes in An Thuong have fast Wi-Fi.");
  await expect(preview).toContainText("Laptop on a cafe table");
  await expect(preview).toContainText("Lời thoại");
  await expect(preview).toContainText("75");
  await expect(preview).toContainText("Không / Chưa đạt");
  await expect(preview).toContainText("Gợi ý ảnh minh hoạ");
  await expect(preview).toContainText("peaceful modern workspace, green plants");
  await expect(preview).not.toContainText("voiceover");
});

test("The Distribution page shows the TikTok script with its length problem", async ({ page, request }) => {
  await review(page, request, "content", "content.repurpose", { ...content,
    tiktok: { hook: "New to Da Nang?", scenes: [{ voiceover: "Cafes in An Thuong have fast Wi-Fi.", visual: "Laptop on a cafe table" }], cta: "Ask TripC", word_count: 88, within_length: false } }, "/distribution");
  await page.getByText("Kịch bản TikTok · 88 từ (ngoài khoảng 120–180 từ)").click();
  await expect(page.getByText("Cafes in An Thuong have fast Wi-Fi.")).toBeVisible();
  await expect(page.getByText("Hình ảnh: Laptop on a cafe table")).toBeVisible();
});

test("A Facebook-only pack does not show empty TikTok and image sections", async ({ page, request }) => {
  const preview = await review(page, request, "content", "content.repurpose", { ...content, tiktok: null, image_suggestion: null });
  await expect(preview).toContainText("An Thuong has many cafes.");
  await expect(preview).not.toContainText("Kịch bản TikTok");
  await expect(preview).not.toContainText("Gợi ý ảnh minh hoạ");
});

test("A reviewer sees measured numbers per article in the Performance report", async ({ page, request }) => {
  const preview = await review(page, request, "performance", "analytics.report", { status: "draft", metrics: { clicks: 0 }, observations: [],
    content_metrics: [{ slug: "an-thuong-guide", title: "An Thuong guide", page_views: 41, cta_clicks: 3 }] });
  await expect(preview).toContainText("Số liệu theo từng bài");
  await expect(preview).toContainText("An Thuong guide");
  await expect(preview).toContainText("Lượt xem");
  await expect(preview).toContainText("41");
  await expect(preview).not.toContainText("page views");
});

test("A reviewer sees what Learning concluded and passes on to Research", async ({ page, request }) => {
  const preview = await review(page, request, "growth_lead", "learning.analyze", { status: "draft", missing_facts: [],
    learning: ["The cited lead aggregate contains 2 leads."], lessons: { promising_titles: ["An Thuong guide"], weak_titles: ["Hai Chau guide"] } });
  await expect(preview).toContainText("The cited lead aggregate contains 2 leads.");
  await expect(preview).toContainText("Bài có tín hiệu tốt");
  await expect(preview).toContainText("An Thuong guide");
  await expect(preview).toContainText("Bài tín hiệu yếu");
  await expect(preview).toContainText("Hai Chau guide");
});

test("A reviewer sees the plan's priority and how each KPI stands", async ({ page, request }) => {
  const preview = await review(page, request, "growth_lead", "strategy.generate", { status: "proposed", missing_facts: [], objective: "Grow enquiries",
    priority: { mode: "conversion", reason: "Visits are on target but leads are behind." },
    kpi_progress: [{ metric_name: "leads", target_value: 30, current_value: 4, status: "behind" }, { metric_name: "clicks", target_value: 300, current_value: null, status: "not_measured" }] });
  await expect(preview).toContainText("Ưu tiên");
  await expect(preview).toContainText("Tăng chuyển đổi");
  await expect(preview).toContainText("Visits are on target but leads are behind.");
  await expect(preview).toContainText("Tiến độ KPI");
  await expect(preview).toContainText("Chưa đạt mục tiêu");
  await expect(preview).toContainText("Chưa đo được");
  await expect(preview).not.toContainText("not_measured");
});

const ILLUSTRATION = { url: "https://media.example.test/generated/gen.webp", alt_text: "[Ảnh minh họa AI] A quiet street", aspect_ratio: "1:1", width: 1080, height: 1080,
  prompt: "A quiet street", model_name: "flux-dev", seed: 7, cost_usd: 0.035, ocr_checked: true, content_hash: "b".repeat(64) };

test("Whoever approves a draft sees the AI illustration that would go out with it", async ({ page, request }) => {
  const preview = await review(page, request, "content", "content.repurpose", { ...content, generated_image: ILLUSTRATION });
  const figure = preview.getByTestId("generated-image");
  await expect(figure.locator("img")).toHaveAttribute("src", ILLUSTRATION.url);
  await expect(figure.locator("img")).toHaveAttribute("alt", ILLUSTRATION.alt_text);
  await expect(figure).toContainText("Ảnh do AI tạo");
  await expect(figure).toContainText("tự xem kỹ");
});

test("A draft without an illustration shows no empty image section", async ({ page, request }) => {
  const preview = await review(page, request, "content", "content.repurpose", { ...content, generated_image: null });
  await expect(preview).toContainText("Bài đăng Facebook");
  await expect(preview).not.toContainText("Ảnh do AI tạo");
});

test("The Distribution page shows the AI illustration of a post", async ({ page, request }) => {
  await review(page, request, "content", "content.repurpose", { ...content, generated_image: ILLUSTRATION }, "/distribution");
  await expect(page.getByTestId("generated-image").locator("img")).toHaveAttribute("src", ILLUSTRATION.url);
});
