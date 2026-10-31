import { expect, test } from "@playwright/test";

test.use({ channel: "chrome" });

test("Performance accepts metrics without an SEO parent and explains disconnected providers", async ({ page, request }) => {
  const response = await request.post("http://localhost:4000/v1/auth/login", {
    data: { email: "owner.tripc.demo@gmail.com", password: "TripC@2026!" },
  });
  expect(response.ok()).toBeTruthy();
  const login = await response.json();
  await page.addInitScript((session) => {
    localStorage.setItem("agos.session", JSON.stringify(session));
    localStorage.setItem("agos.workspace", "10000000-0000-4000-8000-000000000001");
  }, { token: login.access_token, expiresAt: login.expires_at, user: login.user });
  await page.goto("http://localhost:3000/agents/performance");
  await expect(page.getByText("Metric providers", { exact: true })).toBeVisible();
  await expect(page.getByText("Parent artifact hợp lệ", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Chưa kết nối provider; báo cáo vẫn có thể trả insufficient_data/)).toBeVisible();

  await page.goto("http://localhost:3000/agents/content");
  const facebook = page.getByText("Facebook Page", { exact: true }).locator("../../..");
  await expect(facebook).toHaveClass(/border-amber-200/);
  await expect(facebook).toContainText("Vẫn có thể tạo bản nháp");
  await expect(facebook).not.toContainText("FACEBOOK_PAGE_PERMISSION_MISSING");
  await expect(facebook.getByRole("link")).toHaveAttribute("href", "/workspace-integrations");
  await expect(page.getByText(/cần bổ sung và duyệt ảnh trước khi đăng bài có ảnh/)).toBeVisible();

  await page.goto("http://localhost:3000/agents/community");
  const knowledge = page.getByText("Knowledge context và source approved", { exact: true }).locator("../../..");
  await expect(knowledge).toHaveClass(/border-emerald-200/);
  const question = "What housing and local living services does TripC offer in Da Nang?";
  await page.getByLabel("Câu hỏi cần phản hồi").fill(question);
  const accepted = page.waitForResponse((response) => response.url().endsWith("/ai-tasks") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Tạo phản hồi nháp", exact: true }).click();
  expect((await accepted).status()).toBe(202);
  await expect(page.getByRole("status").filter({ hasText: "Đã đưa câu hỏi vào hàng đợi" })).toBeVisible();
  await expect.poll(async () => {
    const tasks = await request.get("http://localhost:4000/v1/workspaces/10000000-0000-4000-8000-000000000001/tasks", { headers: { Authorization: `Bearer ${login.access_token}` } });
    const { items } = await tasks.json();
    return items.find((task: { payload?: { input?: { question?: string } } }) => task.payload?.input?.question === question)?.status;
  }, { timeout: 15000 }).toBe("awaiting_approval");
  await expect(page.getByText("Phản hồi gần nhất", { exact: true })).toBeVisible();
  await expect(page.getByText(/trích dẫn nguồn · Chưa tự gửi cho khách/)).toBeVisible();
  await expect(page.locator("blockquote").first()).toContainText("TripC", { timeout: 15000 });
  await page.getByLabel("Câu hỏi cần phản hồi").fill("zzzxxyy consult");
  await page.getByRole("button", { name: "Tạo phản hồi nháp", exact: true }).click();
  await expect(page.getByText("Thiếu dữ liệu · Demo (AI mô phỏng)", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Không có trích dẫn phù hợp/)).toBeVisible();
  await expect(page.getByText(/Có đề xuất lead\. Cần người phụ trách/)).toBeVisible();
  await expect(page.getByText(/Chưa tìm thấy nguồn đã duyệt phù hợp với câu hỏi/)).toBeVisible();
  await page.goto("http://localhost:3000/review-queue");
  await page.getByRole("button", { name: "Xem phản hồi Community", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Kiểm tra phản hồi trước khi duyệt" });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("zzzxxyy consult");
  await expect(preview).toContainText("Cần người phụ trách xử lý");
  await expect(preview).toContainText("Đề xuất lead");
  await expect(preview).not.toContainText('"content_hash"');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await preview.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
});
