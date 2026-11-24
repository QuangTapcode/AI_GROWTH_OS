import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifySentiment } from "../../src/modules/merchant/sentiment";
import { GoogleMapsSpecialistService } from "../../src/modules/gmaps/specialist";
import { listReviews, replyToReview } from "../../src/modules/google/businessProfile";
import { listDriveImages, parseDriveFolderId } from "../../src/modules/google/drive";
import { DriveAssetIngestionService } from "../../src/modules/assets/drive";
import { slotInstant, themeForDate, weekStartOf } from "../../src/modules/planner/calendar";
import { composeText } from "../../src/modules/publisher/calendarPublisher";
import { templateSummary, type DailyMetrics } from "../../src/modules/reports/dailyExecutive";
import { plannedMembersAt } from "../../src/modules/communityGrowth/funnel";
import { extractTopupReference } from "../../src/modules/billing/wallet";
import { paymentReference, vietQrImageUrl } from "../../src/modules/billing/vietqr";
import { canServeOfflineDemo } from "../../src/lib/offlineDemo";
import type { GoogleAuth } from "../../src/modules/google/oauth";
import type { MerchantProfile } from "../../src/modules/merchant/profile";
import { MultiLLMAdapterService } from "../../src/modules/ai/llmAdapter";
import { createFakeDb, jsonResponse, profileRule } from "./fakeDb";

const auth: GoogleAuth = { accessToken: async () => "ya29.test", apiKey: () => null };
const WS = "22222222-2222-4222-8222-222222222222";

describe("Agent 6 — cầu chì cảm xúc bình luận/ review", () => {
  it.each([
    ["Ăn xong bị đau bụng cả đêm, quán bẩn quá", "crisis"],
    ["Thấy con gián trong tô bún", "crisis"],
    ["Phục vụ chậm quá, đợi 40 phút, thất vọng", "negative"],
    ["Món không ngon như lời đồn", "negative"],
    ["Bún chả cá ngon, nhân viên nhiệt tình, sẽ quay lại", "positive"],
    ["Quán mở cửa mấy giờ ạ?", "neutral"],
    ["Cho mình hỏi đặt bàn 6 người tối nay được không", "neutral"],
    ["Kiếm tiền online 5 triệu/ngày inbox mình để nhận", "spam"],
  ])("%s → %s", (text, label) => {
    expect(classifySentiment(text).label).toBe(label);
  });
  it("review 1 sao không có nội dung vẫn là tiêu cực", () => {
    expect(classifySentiment("", 1).label).toBe("negative");
  });
});

describe("Agent 5 — Google Business Profile client", () => {
  it("đọc review: quy đổi số sao, ẩn danh, trả lời sẵn có", async () => {
    const seen: string[] = [];
    const res = await listReviews(auth, { accountId: "111", locationId: "222" }, async (url) => {
      seen.push(url);
      return jsonResponse(200, {
        averageRating: 4.6,
        totalReviewCount: 87,
        reviews: [
          { reviewId: "r1", name: "accounts/111/locations/222/reviews/r1", reviewer: { displayName: "Lan" }, starRating: "FIVE", comment: "Ngon!", createTime: "2026-11-24T01:00:00Z", updateTime: "2026-11-24T01:00:00Z" },
          { reviewId: "r2", name: "accounts/111/locations/222/reviews/r2", reviewer: { isAnonymous: true }, starRating: "TWO", createTime: "2026-11-23T01:00:00Z", updateTime: "2026-11-23T01:00:00Z", reviewReply: { comment: "Xin lỗi", updateTime: "x" } },
        ],
      });
    });
    expect(seen[0]).toContain("https://mybusiness.googleapis.com/v4/accounts/111/locations/222/reviews");
    expect(res.averageRating).toBe(4.6);
    expect(res.reviews[0]).toMatchObject({ rating: 5, reviewerName: "Lan" });
    expect(res.reviews[1]).toMatchObject({ rating: 2, reviewerName: "Khách ẩn danh", existingReply: { comment: "Xin lỗi" } });
  });

  it("trả lời review: PUT {review}/reply với Bearer token", async () => {
    let call: { url: string; init?: RequestInit } | null = null;
    await replyToReview(auth, "accounts/1/locations/2/reviews/r1", "Cảm ơn bạn!", async (url, init) => {
      call = { url, init };
      return jsonResponse(200, { comment: "Cảm ơn bạn!" });
    });
    expect(call!.url).toBe("https://mybusiness.googleapis.com/v4/accounts/1/locations/2/reviews/r1/reply");
    expect(call!.init?.method).toBe("PUT");
    expect(new Headers(call!.init?.headers).get("authorization")).toBe("Bearer ya29.test");
    expect(JSON.parse(String(call!.init?.body))).toEqual({ comment: "Cảm ơn bạn!" });
  });
});

describe("Agent 5 — tự trả lời review an toàn, review xấu chờ duyệt", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN", "GBP_ACCOUNT_ID", "GBP_LOCATION_ID", "TELEGRAM_BOT_TOKEN"]) saved[k] = process.env[k];
    Object.assign(process.env, { GOOGLE_OAUTH_CLIENT_ID: "c", GOOGLE_OAUTH_CLIENT_SECRET: "s", GOOGLE_OAUTH_REFRESH_TOKEN: "r", GBP_ACCOUNT_ID: "111", GBP_LOCATION_ID: "222" });
    delete process.env.TELEGRAM_BOT_TOKEN;
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
  });

  it("5★ khen → đăng trả lời ngay; 1★ chê → nháp needs_approval, không đăng", async () => {
    const pending = [
      { id: "a", workspace_id: WS, item_type: "review", external_id: "r1", author_name: "Lan", rating: 5, content: "Bún chả cá ngon, sẽ quay lại", status: "pending", metadata: { gbp_name: "accounts/111/locations/222/reviews/r1" }, created_at: new Date() },
      { id: "b", workspace_id: WS, item_type: "review", external_id: "r2", author_name: "Hùng", rating: 1, content: "Phục vụ chậm quá, thất vọng", status: "pending", metadata: { gbp_name: "accounts/111/locations/222/reviews/r2" }, created_at: new Date() },
    ];
    const db = createFakeDb([
      profileRule({ seo_keywords: ["bún chả cá Đà Nẵng"] }),
      [/INSERT INTO gmaps_reputation/, () => [{ id: "new" }]],
      [/WHERE workspace_id = \$1::uuid AND item_type = 'review' AND status = 'pending'/, () => pending],
    ]);
    const puts: string[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      if (url.includes("/reviews?")) return jsonResponse(200, { averageRating: 4.5, totalReviewCount: 2, reviews: [] });
      if (url.endsWith("/reply")) {
        puts.push(url);
        return jsonResponse(200, {});
      }
      return jsonResponse(404, {});
    };
    const llm = { generate: async () => ({ text: "Cảm ơn anh/chị đã ghé quán bún chả cá Đà Nẵng!", provider_used: "gemini" }) } as unknown as MultiLLMAdapterService;
    const service = new GoogleMapsSpecialistService({ db: db as any, llm, auth, fetch: fetchImpl });
    const result = await service.syncAndAutoReplyAllReviews(WS);
    expect(result).toMatchObject({ status: "ok", auto_replied: 1, awaiting_approval: 1 });
    expect(puts).toEqual(["https://mybusiness.googleapis.com/v4/accounts/111/locations/222/reviews/r1/reply"]);
    const approval = db.callsMatching(/status = 'needs_approval'/)[0];
    expect(approval.params[1]).toBe("b");
  });

  it("chưa kết nối Google → not_connected, không tạo dữ liệu giả", async () => {
    delete process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
    const db = createFakeDb([profileRule()]);
    const r = await new GoogleMapsSpecialistService({ db: db as any, auth }).syncAndAutoReplyAllReviews(WS);
    expect(r.status).toBe("not_connected");
    expect(db.callsMatching(/INSERT INTO gmaps_reputation/)).toHaveLength(0);
  });
});

describe("Agent 2 — Google Drive", () => {
  it("đọc ID thư mục từ các dạng link", () => {
    expect(parseDriveFolderId("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv?usp=sharing")).toBe("1AbCdEfGhIjKlMnOpQrStUv");
    expect(parseDriveFolderId("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUv")).toBe("1AbCdEfGhIjKlMnOpQrStUv");
    expect(parseDriveFolderId("https://facebook.com/x")).toBeNull();
  });

  it("liệt kê ảnh trong thư mục và thư mục con cấp 1", async () => {
    const files = await listDriveImages(auth, "ROOT", async (url) => {
      const q = new URL(url).searchParams.get("q") ?? "";
      if (q.includes("'ROOT' in parents") && q.includes("image/")) return jsonResponse(200, { files: [{ id: "f1", name: "bun.jpg", mimeType: "image/jpeg", modifiedTime: "2026-11-24T00:00:00Z" }] });
      if (q.includes("'ROOT' in parents") && q.includes("folder")) return jsonResponse(200, { files: [{ id: "SUB", name: "Không gian", mimeType: "application/vnd.google-apps.folder", modifiedTime: "x" }] });
      if (q.includes("'SUB' in parents")) return jsonResponse(200, { files: [{ id: "f2", name: "quan.png", mimeType: "image/png", modifiedTime: "2026-11-23T00:00:00Z" }] });
      return jsonResponse(200, { files: [] });
    });
    expect(files.map((f) => [f.id, f.folderName])).toEqual([["f1", undefined], ["f2", "Không gian"]]);
  });

  it("quét: ảnh mới → tải về → LLM thị giác trả JSON → staged; ảnh mờ → rejected", async () => {
    const saved = process.env.GOOGLE_OAUTH_CLIENT_ID;
    Object.assign(process.env, { GOOGLE_OAUTH_CLIENT_ID: "c", GOOGLE_OAUTH_CLIENT_SECRET: "s", GOOGLE_OAUTH_REFRESH_TOKEN: "r" });
    const pendingRows = [
      { id: "a1", drive_file_id: "f1", file_name: "bun.jpg", mime_type: "image/jpeg", analysis: {} },
      { id: "a2", drive_file_id: "f2", file_name: "mo.jpg", mime_type: "image/jpeg", analysis: {} },
    ];
    const db = createFakeDb([
      profileRule(),
      [/INSERT INTO drive_asset_queue/, () => [{ id: "x", status: "pending_analysis", inserted: true }]],
      [/status = 'pending_analysis' AND drive_file_id IS NOT NULL/, () => pendingRows],
    ]);
    const replies = [
      '{"asset_type":"food_photo","dish_name":"Bún chả cá","tags":["bún","cá"],"flavor_notes":"Nước dùng trong, chả cá vàng giòn","caption":"Tô bún chả cá nóng hổi","quality":"good"}',
      '{"asset_type":"food_photo","tags":[],"quality":"blurry"}',
    ];
    const llm = { generate: async () => ({ text: replies.shift()!, provider_used: "gemini" }) } as unknown as MultiLLMAdapterService;
    const fetchImpl = async (url: string) => {
      if (url.includes("alt=media")) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return jsonResponse(200, { files: [{ id: "f1", name: "bun.jpg", mimeType: "image/jpeg", modifiedTime: "t" }] });
    };
    const r = await new DriveAssetIngestionService({ db: db as any, llm, auth, fetch: fetchImpl }).scanDrive(WS);
    expect(r).toMatchObject({ status: "ok", analyzed: 1, rejected: 1, failed: 0 });
    const updates = db.callsMatching(/SET asset_type = \$3/);
    expect(updates[0].params).toEqual(expect.arrayContaining(["Bún chả cá", "staged", "gemini"]));
    expect(updates[1].params).toContain("rejected");
    process.env.GOOGLE_OAUTH_CLIENT_ID = saved;
  });
});

describe("Agent 3/4 — lịch & xuất bản", () => {
  it("tuần bắt đầu Thứ Hai theo giờ VN, slot đúng giờ vàng", () => {
    expect(weekStartOf(new Date("2026-11-29T18:00:00Z"))).toBe("2026-11-30"); // 01:00 Thứ Hai VN
    expect(weekStartOf(new Date("2026-11-24T08:00:00Z"))).toBe("2026-11-23");
    expect(slotInstant("2026-11-23", 0, "11:00").toISOString()).toBe("2026-11-23T04:00:00.000Z");
  });
  it("gắn chủ đề ngày lễ", () => {
    const profile = { settings: {}, businessName: "X" } as unknown as MerchantProfile;
    expect(themeForDate(new Date("2026-12-24T11:00:00Z"), profile)).toBe("Đêm Giáng sinh");
    expect(themeForDate(new Date("2026-12-22T11:00:00Z"), profile)).toBe("Chuẩn bị Đêm Giáng sinh");
  });
  it("ghép nội dung đăng: Maps không hashtag, Instagram không CTA thừa", () => {
    const base = { caption: "Bún chả cá nóng hổi", hashtags: ["#bunchaca", "#danang"], call_to_action: "Nhắn tin giữ bàn" };
    expect(composeText({ ...base, channel: "facebook" })).toBe("Bún chả cá nóng hổi\n\n👉 Nhắn tin giữ bàn\n\n#bunchaca #danang");
    expect(composeText({ ...base, channel: "google_maps" })).not.toContain("#");
    expect(composeText({ ...base, channel: "instagram" })).not.toContain("👉");
  });
});

describe("Agent 1 — báo cáo ngày chỉ dùng số thật", () => {
  it("mẫu báo cáo nêu đúng con số và việc cần làm", () => {
    const m: DailyMetrics = {
      date: "2026-11-24", posts_published: 3, posts_published_by_channel: { facebook: 2, google_maps: 1 }, posts_failed: 0, posts_awaiting_approval: 4,
      comments_received: 12, comments_replied: 10, comments_escalated: 1, comment_median_reply_minutes: 1.5, dms_received: 6, dms_replied: 6,
      booking_requests_new: 2, booking_guests_new: 9, bookings_pending_confirmation: 1, bookings_today_confirmed: 3, guests_today_confirmed: 11,
      gmaps_new_reviews: 2, gmaps_replies_published: 2, gmaps_awaiting_approval: 0, gmaps_average_rating: 4.6, drive_assets_ingested: 5, drive_assets_ready: 7,
      community_members: 214, community_members_delta: 18, llm_calls: 40, llm_failures: 2, llm_switches: 1, credits_used: 38, wallet_balance_credits: 2962,
    };
    const text = templateSummary({ businessName: "Quán Mẫu" } as MerchantProfile, m);
    expect(text).toContain("24/11/2026");
    expect(text).toContain("Bài đã đăng: 3 (facebook 2, google_maps 1)");
    expect(text).toContain("trung vị 1.5 phút");
    expect(text).toContain("214 thành viên (+18 hôm nay)");
    expect(text).toContain("Xác nhận 1 đặt bàn đang chờ");
  });
});

describe("Agent 8, ví, chế độ demo", () => {
  it("kế hoạch thành viên 12 tuần tới mục tiêu", () => {
    expect(plannedMembersAt(1, 1000)).toBe(50);
    expect(plannedMembersAt(3, 1000)).toBe(210);
    expect(plannedMembersAt(12, 1000)).toBe(1000);
    expect(plannedMembersAt(20, 1000)).toBe(1000);
  });
  it("mã nạp ví và VietQR", () => {
    const ref = paymentReference("NAP");
    expect(ref).toMatch(/^NAP[A-HJ-NP-Z2-9]{8}$/);
    expect(extractTopupReference(`CK ${ref.toLowerCase()} nap vi`)).toBe(ref);
    expect(vietQrImageUrl({ bankBin: "970436", accountNumber: "123" }, 500000, ref)).toBe(`https://img.vietqr.io/image/970436-123-compact2.png?amount=500000&addInfo=${ref}`);
  });
  it("demo offline chỉ khi bật cờ VÀ lỗi mất kết nối DB", () => {
    const saved = process.env.AGOS_OFFLINE_DEMO;
    const connErr = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    delete process.env.AGOS_OFFLINE_DEMO;
    expect(canServeOfflineDemo(connErr)).toBe(false);
    process.env.AGOS_OFFLINE_DEMO = "1";
    expect(canServeOfflineDemo(connErr)).toBe(true);
    expect(canServeOfflineDemo(Object.assign(new Error("forbidden"), { code: "FORBIDDEN" }))).toBe(false);
    expect(canServeOfflineDemo(Object.assign(new Error("syntax"), { code: "42601" }))).toBe(false);
    if (saved === undefined) delete process.env.AGOS_OFFLINE_DEMO;
    else process.env.AGOS_OFFLINE_DEMO = saved;
  });
});

describe("Dữ liệu quán minh họa (BA)", () => {
  it("data/merchant/sample-restaurant-danang.json hợp lệ theo schema hồ sơ quán", async () => {
    const { readFileSync } = await import("node:fs");
    const { merchantSettingsSchema } = await import("../../src/modules/merchant/profile");
    const { _note, ...settings } = JSON.parse(readFileSync(new URL("../../../../data/merchant/sample-restaurant-danang.json", import.meta.url), "utf8"));
    expect(_note).toMatch(/MINH HỌA/);
    const parsed = merchantSettingsSchema.parse(settings);
    expect(parsed.menu!.every((m) => typeof m.price_vnd === "number")).toBe(true);
  });
});
