import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processReceivedCommunityMessages } from "../../src/modules/community/service";
import { BookingLeadService } from "../../src/modules/booking/leads";
import { GoogleMapsSpecialistService } from "../../src/modules/gmaps/specialist";
import { ContentPlannerService } from "../../src/modules/planner/calendar";
import { CalendarPublisherService } from "../../src/modules/publisher/calendarPublisher";
import { DailyExecutiveReportService, computeDailyMetrics, vnDate } from "../../src/modules/reports/dailyExecutive";
import { MerchantWalletService } from "../../src/modules/billing/wallet";
import { ZeroTechOnboardingService } from "../../src/modules/onboarding/onboarding";
import { MultiLLMAdapterService } from "../../src/modules/ai/llmAdapter";
import { tickMerchantAgents } from "../../src/modules/merchant/scheduler";
import type { GoogleAuth } from "../../src/modules/google/oauth";
import { jsonResponse } from "./fakeDb";

/**
 * Tích hợp với Postgres thật (DB tạm, chạy toàn bộ migration): RUN_MERCHANT_DB=1 DATABASE_URL=... npx vitest run tests/merchant/merchantAgents.pg.test.ts
 * Kiểm chứng các luồng 8 agent ghi/đọc đúng bảng, ràng buộc và trạng thái — gọi API ngoài bằng fetch giả.
 */
describe.skipIf(process.env.RUN_MERCHANT_DB !== "1")("8 agent merchant trên Postgres thật", () => {
  const name = `agos_merchant_${Date.now()}`;
  const workspace = randomUUID();
  const owner = randomUUID();
  let admin: Pool;
  let db: Pool;
  let plannedWeek = "";
  const saved: Record<string, string | undefined> = {};
  const ENV = {
    TOKEN_ENCRYPTION_KEY: "pg-test-key",
    AUTH_SECRET: "pg-test-secret",
    GOOGLE_OAUTH_CLIENT_ID: "c",
    GOOGLE_OAUTH_CLIENT_SECRET: "s",
    GOOGLE_OAUTH_REFRESH_TOKEN: "r",
    GBP_ACCOUNT_ID: "111",
    GBP_LOCATION_ID: "222",
    FACEBOOK_PAGE_ID: "page-1",
    FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
    WALLET_BANK_BIN: "970436",
    WALLET_BANK_ACCOUNT: "0011001234567",
    PUBLIC_API_BASE_URL: "https://api.example.test",
  } as const;
  const auth: GoogleAuth = { accessToken: async () => "ya29.pg", apiKey: () => null };
  const stubLlm = (text: string) => ({ generate: async () => ({ text, provider_used: "gemini", attempts: [], latency_ms: 1, model: "m" }) }) as unknown as MultiLLMAdapterService;

  beforeAll(async () => {
    for (const k of [...Object.keys(ENV), "TELEGRAM_BOT_TOKEN", "INSTAGRAM_BUSINESS_ACCOUNT_ID", "TIKTOK_ACCESS_TOKEN"]) saved[k] = process.env[k];
    Object.assign(process.env, ENV);
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    delete process.env.TIKTOK_ACCESS_TOKEN;
    const url = new URL(process.env.DATABASE_URL!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Local DB only");
    admin = new Pool({ connectionString: url.href });
    await admin.query(`CREATE DATABASE "${name}"`);
    url.pathname = `/${name}`;
    db = new Pool({ connectionString: url.href });
    const dir = resolve("../../database/migrations");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql") && !x.endsWith(".down.sql")).sort()) await db.query(readFileSync(resolve(dir, f), "utf8"));
    await db.query("INSERT INTO users(id,email,full_name) VALUES($1,$2,$3)", [owner, `${owner}@example.test`, "Chủ quán thử nghiệm"]);
    await db.query("INSERT INTO workspaces(id,name,slug) VALUES($1,$2,$3)", [workspace, "Quán thử nghiệm", workspace]);
    await db.query("INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [workspace, owner]);
  }, 120_000);

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin?.end();
    for (const [k, v] of Object.entries(saved)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
  });

  it("Onboarding: kiểm tra link, lưu, xếp lịch 8 agent; link sai bị từ chối", async () => {
    const service = new ZeroTechOnboardingService(db);
    await expect(service.activate(workspace, { business_name: "Quán", fanpage_url: "abc", gmaps_url: "x", gdrive_url: "y" })).rejects.toThrow();
    const state = await service.activate(workspace, {
      business_name: "Bún Chả Cá Thử Nghiệm",
      fanpage_url: "https://facebook.com/bunchaca.test",
      gmaps_url: "https://maps.app.goo.gl/AbCdEf",
      gdrive_url: "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv",
      community_group_url: "https://facebook.com/groups/bunchaca.test",
    });
    expect(state.onboarding_completed).toBe(true);
    expect(state.welcome_message).toContain("Bún Chả Cá Thử Nghiệm");
    expect(state.active_agents).toHaveLength(8);
    expect(state.active_agents.find((a) => a.name === "publisher")?.status).toBe("active");
    const runs = await db.query("SELECT count(*)::int AS c FROM merchant_agent_runs WHERE workspace_id = $1", [workspace]);
    expect(runs.rows[0].c).toBe(8);
    await service.updateSettings(workspace, {
      opening_hours: { open: "09:00", close: "22:00" },
      address: "99 Nguyễn Văn Linh, Đà Nẵng",
      menu: [{ name: "Bún chả cá", price_vnd: 45000, category: "Món chính" }],
    });
  });

  it("Agent 7: tin nhắn Messenger → state machine → booking_leads + outbox trả lời", async () => {
    const send = async (id: string, content: string) => {
      await db.query(
        "INSERT INTO community_messages (id, workspace_id, platform, external_id, author_name, author_contact, content) VALUES ($1,$2,'facebook_message',$3,'Lê Văn Bình','psid-pg',$4)",
        [id, workspace, `mid-${id}`, content],
      );
      await processReceivedCommunityMessages(db, workspace, owner, null);
    };
    await send(randomUUID(), "Cho anh đặt bàn 5 người tối mai 19h, sđt 0935111222");
    await send(randomUUID(), "ok em");
    const lead = (await db.query("SELECT * FROM booking_leads WHERE workspace_id = $1", [workspace])).rows[0];
    expect(lead).toMatchObject({ customer_name: "Lê Văn Bình", customer_phone: "0935111222", party_size: 5, status: "pending", platform: "facebook" });
    const replies = (await db.query("SELECT payload FROM outbox_events WHERE workspace_id = $1 AND event_type = 'community.reply' ORDER BY created_at", [workspace])).rows;
    expect(replies).toHaveLength(2);
    expect(replies[1].payload.text).toMatch(/ghi nhận yêu cầu giữ bàn 5 người/);
    const conv = (await db.query("SELECT state FROM booking_conversations WHERE workspace_id = $1", [workspace])).rows[0];
    expect(conv.state).toBe("confirmed");

    // Nhân viên xác nhận → khách nhận tin qua Messenger
    await new BookingLeadService(db).updateLead(workspace, lead.id, { status: "confirmed" });
    const confirm = (await db.query("SELECT payload FROM outbox_events WHERE workspace_id = $1 AND dedup_key LIKE 'booking-confirmed:%'", [workspace])).rows[0];
    expect(confirm.payload).toMatchObject({ recipient: "psid-pg", platform: "facebook_message" });
  });

  it("Agent 6: bình luận 'phốt' bị chặn tự trả lời và chuyển escalated", async () => {
    const id = randomUUID();
    await db.query(
      "INSERT INTO community_messages (id, workspace_id, platform, external_id, author_name, author_contact, content) VALUES ($1,$2,'facebook_comment','c-1','Khách','fb-1','Ăn xong bị đau bụng cả đêm, quán bẩn')",
      [id, workspace],
    );
    await processReceivedCommunityMessages(db, workspace, owner, null);
    const row = (await db.query("SELECT status, metadata FROM community_messages WHERE id = $1", [id])).rows[0];
    expect(row.status).toBe("escalated");
    expect(row.metadata.sentiment).toBe("crisis");
  });

  it("Agent 5: đồng bộ review GBP, tự trả lời 5★, idempotent khi đồng bộ lại", async () => {
    const replied: string[] = [];
    const fetchImpl = async (url: string) => {
      if (url.includes("/reviews?")) {
        return jsonResponse(200, {
          averageRating: 4.7,
          totalReviewCount: 120,
          reviews: [
            { reviewId: "rv1", name: "accounts/111/locations/222/reviews/rv1", reviewer: { displayName: "An" }, starRating: "FIVE", comment: "Bún chả cá rất ngon", createTime: new Date().toISOString(), updateTime: new Date().toISOString() },
          ],
        });
      }
      if (url.endsWith("/reply")) {
        replied.push(url);
        return jsonResponse(200, {});
      }
      return jsonResponse(404, {});
    };
    const service = new GoogleMapsSpecialistService({ db, auth, fetch: fetchImpl, llm: stubLlm("Cảm ơn An đã ghé quán bún chả cá Đà Nẵng!") });
    const first = await service.syncAndAutoReplyAllReviews(workspace);
    expect(first).toMatchObject({ status: "ok", new_reviews: 1, auto_replied: 1 });
    const second = await service.syncAndAutoReplyAllReviews(workspace);
    expect(second).toMatchObject({ new_reviews: 0, auto_replied: 0 });
    expect(replied).toHaveLength(1);
    const overview = await service.getOverview(workspace);
    expect(overview).toMatchObject({ average_rating: 4.7, total_reviews_on_google: 120, synced_reviews: 1, replied_reviews: 1, response_rate_percent: 100 });
  });

  it("Agent 3 + 4: lập lịch tuần từ ảnh thật, duyệt, đăng Facebook đúng giờ", async () => {
    await db.query(
      `INSERT INTO drive_asset_queue (workspace_id, file_name, file_url, drive_file_id, asset_type, dish_name, generated_caption, status)
       VALUES ($1, 'bun.jpg', 'https://drive.google.com/file/d/f1/view', 'f1', 'food_photo', 'Bún chả cá', 'Tô bún chả cá nóng hổi', 'staged')`,
      [workspace],
    );
    const planner = new ContentPlannerService(db, stubLlm('{"posts":[]}'), () => new Date());
    const week = await planner.generateWeek(workspace);
    plannedWeek = week.week_start;
    expect(week.created).toBeGreaterThan(0);
    expect(week.entries.every((e) => e.status === "draft")).toBe(true);
    const fb = week.entries.find((e) => e.channel === "facebook")!;
    await planner.review(workspace, [fb.id], "approve", owner);
    await db.query("UPDATE content_calendar_entries SET scheduled_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [fb.id]);

    const graphCalls: Array<{ url: string; body: string }> = [];
    const publisher = new CalendarPublisherService(db, async (url, init) => {
      graphCalls.push({ url, body: String(init?.body ?? "") });
      return jsonResponse(200, { id: "photo-1", post_id: "page-1_post-9" });
    });
    const stats = await publisher.publishDue(workspace);
    expect(stats).toMatchObject({ published: 1, failed: 0 });
    expect(graphCalls[0].url).toBe("https://graph.facebook.com/v21.0/page-1/photos");
    const params = new URLSearchParams(graphCalls[0].body);
    expect(params.get("url")).toMatch(/^https:\/\/api\.example\.test\/public\/media\/assets\/.+sig=/);
    const after = (await db.query("SELECT status, external_post_id FROM content_calendar_entries WHERE id = $1", [fb.id])).rows[0];
    expect(after).toEqual({ status: "published", external_post_id: "page-1_post-9" });
    // Đăng lại không tạo bài trùng
    expect((await publisher.publishDue(workspace)).published).toBe(0);
  });

  it("Agent 4: lỗi tạm thời → thử lại có backoff; token hỏng → failed ngay", async () => {
    const { entries } = await new ContentPlannerService(db).listWeek(workspace, plannedWeek);
    const drafts = entries.filter((e) => e.status === "draft" && e.channel === "facebook").slice(0, 2);
    await new ContentPlannerService(db).review(workspace, drafts.map((d) => d.id), "approve", owner);
    for (const [i, d] of drafts.entries()) {
      await db.query(`UPDATE content_calendar_entries SET scheduled_at = NOW() - INTERVAL '${i + 2} minutes' WHERE id = $1`, [d.id]);
    }
    let n = 0;
    const stats = await new CalendarPublisherService(db, async () =>
      n++ === 0 ? jsonResponse(500, { error: { message: "temporarily unavailable", code: 2 } }) : jsonResponse(400, { error: { message: "Invalid OAuth access token", code: 190 } }),
    ).publishDue(workspace);
    expect(stats).toMatchObject({ retrying: 1, failed: 1 });
    const rows = (await db.query("SELECT status, metadata FROM content_calendar_entries WHERE id = ANY($1::uuid[]) ORDER BY scheduled_at", [drafts.map((d) => d.id)])).rows;
    expect(rows.map((r) => r.status).sort()).toEqual(["approved", "failed"]);
    expect(rows.find((r) => r.status === "approved")!.metadata.next_attempt_at).toBeTruthy();
  });

  it("Ví: tạo giao dịch chờ + VietQR; webhook cộng credit đúng 1 lần", async () => {
    const wallet = new MerchantWalletService(db);
    const before = (await wallet.getWallet(workspace)).balance_credits;
    const tx = await wallet.createTopup(workspace, "growth");
    expect(tx).toMatchObject({ status: "pending", amount_vnd: 500000, credits: 3000 });
    expect(tx.vietqr_image_url).toContain("970436-0011001234567");
    expect((await wallet.getWallet(workspace)).balance_credits).toBe(before); // chưa trả tiền thì chưa cộng
    await expect(wallet.settle(tx.qr_reference, 400000, "bank:x")).rejects.toMatchObject({ code: "UNDERPAID" });
    const settled = await wallet.settle(tx.qr_reference, 500000, "bank:tx-1");
    expect(settled?.balance_credits).toBe(before + 3000);
    expect(await wallet.settle(tx.qr_reference, 500000, "bank:tx-1")).toBeNull(); // webhook gửi lặp
  });

  it("Agent 1: báo cáo ngày đếm đúng số liệu thật trong DB", async () => {
    const metrics = await computeDailyMetrics(db, workspace, vnDate(new Date()));
    expect(metrics).toMatchObject({ posts_published: 1, booking_requests_new: 1, booking_guests_new: 5, gmaps_replies_published: 1, comments_escalated: 1 });
    const report = await new DailyExecutiveReportService(db, stubLlm("Báo cáo AI"), () => new Date()).generateAndDeliver(workspace);
    expect(report.summary_markdown).toBe("Báo cáo AI");
    expect((report.delivery as any).telegram.status).toBe("not_configured");
  });

  it("Scheduler: tick chạy agent tới lượt, khóa chống chạy trùng", async () => {
    const results = await tickMerchantAgents(db);
    const mine = results.find((r) => r.workspace_id === workspace)!;
    expect(mine.runs.length).toBeGreaterThan(0);
    const again = await tickMerchantAgents(db);
    expect(again.find((r) => r.workspace_id === workspace)?.runs ?? []).toHaveLength(0); // chưa tới lượt kế
  }, 60_000);
});
