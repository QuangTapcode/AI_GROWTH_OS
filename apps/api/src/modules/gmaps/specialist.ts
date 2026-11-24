import type { Pool } from "pg";
import defaultPool from "../../lib/db";
import { AppError } from "../../lib/errors";
import { LlmUnavailableError, MultiLLMAdapterService } from "../ai/llmAdapter";
import type { FetchLike } from "../ai/providers";
import {
  createLocalPost,
  discoverLocation,
  envLocationRef,
  listReviews,
  replyToReview as gbpReply,
  updateFoodMenu,
  uploadLocationPhoto,
  type GbpCallToAction,
  type GbpLocationRef,
} from "../google/businessProfile";
import { GoogleApiError, GoogleNotConnectedError, defaultGoogleAuth, googleOAuthConfigured, type GoogleAuth } from "../google/oauth";
import { loadMerchantProfile, seoKeywords, type MerchantProfile } from "../merchant/profile";
import { systemPromptFor } from "../merchant/prompts";
import { classifySentiment } from "../merchant/sentiment";
import { alertOwner } from "../merchant/notify";
import { assetPublicImageUrl } from "../assets/media";

/**
 * Agent 5 — Google Maps Specialist (Google Business Profile).
 *
 * Đồng bộ review thật → AI soạn trả lời có từ khóa địa phương →
 *   - review ≥ ngưỡng sao (mặc định 4★) và nội dung không tiêu cực: đăng trả lời ngay (mục tiêu < 5 phút);
 *   - review thấp sao / tiêu cực / nguy cơ "phốt": lưu bản nháp, báo chủ quán qua Telegram, chờ duyệt.
 * Local Post và ảnh mới chỉ đăng khi người dùng bấm đăng hoặc chủ quán bật auto_publish_gmaps_posts.
 * Không kết nối Google → trả trạng thái not_connected, không tạo dữ liệu giả.
 */
export interface GMapsItem {
  id: string;
  workspace_id: string;
  item_type: "review" | "local_post" | "photo_update";
  external_id: string | null;
  author_name: string;
  author_avatar: string | null;
  rating: number | null;
  content: string;
  reply_text: string | null;
  draft_reply: string | null;
  replied_at: string | null;
  reply_source: string | null;
  seo_keywords: string[];
  status: "pending" | "needs_approval" | "replied" | "flagged" | "draft" | "published" | "failed";
  error_message: string | null;
  review_created_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface GMapsConnection {
  connected: boolean;
  reason?: string;
  location?: { account_id: string; location_id: string; title?: string };
}

export interface GMapsOverview {
  connection: GMapsConnection;
  average_rating: number | null;
  total_reviews_on_google: number | null;
  synced_reviews: number;
  replied_reviews: number;
  awaiting_approval: number;
  response_rate_percent: number | null;
  median_reply_minutes: number | null;
  last_synced_at: string | null;
  top_seo_keywords: string[];
}

export interface GMapsDeps {
  db?: Pick<Pool, "query">;
  llm?: MultiLLMAdapterService;
  auth?: GoogleAuth;
  fetch?: FetchLike;
}

const DEFAULT_MIN_AUTO_RATING = 4;

function mapRow(row: any): GMapsItem {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    item_type: row.item_type,
    external_id: row.external_id ?? null,
    author_name: row.author_name,
    author_avatar: row.author_avatar ?? null,
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    content: row.content,
    reply_text: row.reply_text ?? null,
    draft_reply: row.draft_reply ?? null,
    replied_at: row.replied_at ? new Date(row.replied_at).toISOString() : null,
    reply_source: row.reply_source ?? null,
    seo_keywords: Array.isArray(row.seo_keywords) ? row.seo_keywords : [],
    status: row.status,
    error_message: row.error_message ?? null,
    review_created_at: row.review_created_at ? new Date(row.review_created_at).toISOString() : null,
    created_at: new Date(row.created_at).toISOString(),
    metadata: row.metadata ?? {},
  };
}

export class GoogleMapsSpecialistService {
  private readonly db: Pick<Pool, "query">;
  private readonly llm: MultiLLMAdapterService;
  private readonly auth: GoogleAuth;
  private readonly fetchImpl?: FetchLike;

  constructor(deps: GMapsDeps | Pick<Pool, "query"> = {}) {
    const d: GMapsDeps = "query" in deps ? { db: deps as Pick<Pool, "query"> } : (deps as GMapsDeps);
    this.db = d.db ?? defaultPool;
    this.llm = d.llm ?? new MultiLLMAdapterService(this.db);
    this.auth = d.auth ?? defaultGoogleAuth();
    this.fetchImpl = d.fetch;
  }

  /** Xác định địa điểm GBP của quán; lưu vào parsed_refs.gbp để lần sau không phải dò lại. */
  async resolveLocation(workspaceId: string, profile?: MerchantProfile): Promise<GbpLocationRef> {
    const fromEnv = envLocationRef();
    if (fromEnv) return fromEnv;
    const p = profile ?? (await loadMerchantProfile(this.db, workspaceId));
    const cached = p.parsedRefs.gbp as { accountId?: string; locationId?: string; title?: string } | undefined;
    if (cached?.accountId && cached.locationId) return { accountId: cached.accountId, locationId: cached.locationId, title: cached.title };
    if (!googleOAuthConfigured()) throw new GoogleNotConnectedError();
    const found = await discoverLocation(this.auth, { mapsUrl: p.links.gmaps, businessName: p.businessName }, this.fetchImpl);
    if (!found) {
      throw new AppError(409, "GBP_LOCATION_NOT_FOUND", "Không tìm thấy (hoặc không xác định duy nhất) địa điểm Google Maps của quán trong tài khoản Google đã cấp quyền. Đặt GBP_ACCOUNT_ID/GBP_LOCATION_ID hoặc kiểm tra link Maps.");
    }
    await this.db.query(
      `INSERT INTO merchant_onboarding (workspace_id, parsed_refs) VALUES ($1::uuid, jsonb_build_object('gbp', $2::jsonb))
       ON CONFLICT (workspace_id) DO UPDATE SET parsed_refs = merchant_onboarding.parsed_refs || jsonb_build_object('gbp', $2::jsonb), updated_at = NOW()`,
      [workspaceId, JSON.stringify({ accountId: found.accountId, locationId: found.locationId, title: found.title ?? null })],
    );
    return found;
  }

  async connectionStatus(workspaceId: string): Promise<GMapsConnection> {
    if (!googleOAuthConfigured() && !envLocationRef()) {
      return { connected: false, reason: "Chưa kết nối tài khoản Google Business Profile (thiếu GOOGLE_OAUTH_* trong cấu hình máy chủ)" };
    }
    if (!googleOAuthConfigured()) return { connected: false, reason: "Thiếu GOOGLE_OAUTH_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN" };
    const profile = await loadMerchantProfile(this.db, workspaceId);
    const fromEnv = envLocationRef();
    const cached = profile.parsedRefs.gbp as { accountId?: string; locationId?: string; title?: string } | undefined;
    const ref = fromEnv ?? (cached?.accountId && cached.locationId ? (cached as GbpLocationRef) : null);
    return ref
      ? { connected: true, location: { account_id: ref.accountId, location_id: ref.locationId, title: ref.title } }
      : { connected: true, reason: "Đã có quyền Google, địa điểm sẽ được xác định ở lần đồng bộ đầu tiên" };
  }

  async getOverview(workspaceId: string): Promise<GMapsOverview> {
    const [connection, profile, stats] = await Promise.all([
      this.connectionStatus(workspaceId),
      loadMerchantProfile(this.db, workspaceId),
      this.db.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'replied')::int AS replied,
                COUNT(*) FILTER (WHERE status = 'needs_approval')::int AS awaiting,
                -- Thời gian từ lúc khách viết review đến lúc quán trả lời; bỏ qua review tồn đọng
                -- từ trước khi agent được kết nối (viết sớm hơn lần đồng bộ đầu > 1 ngày).
                PERCENTILE_CONT(0.5) WITHIN GROUP (
                  ORDER BY EXTRACT(EPOCH FROM (replied_at - COALESCE(review_created_at, created_at))) / 60.0
                ) FILTER (WHERE replied_at IS NOT NULL AND reply_source IN ('auto', 'owner_approved', 'owner_manual')
                            AND COALESCE(review_created_at, created_at) > created_at - INTERVAL '1 day') AS median_minutes
           FROM gmaps_reputation WHERE workspace_id = $1::uuid AND item_type = 'review'`,
        [workspaceId],
      ),
    ]);
    const s = stats.rows[0] ?? {};
    const gbp = (profile.parsedRefs.gbp ?? {}) as { average_rating?: number; total_reviews?: number; synced_at?: string };
    const total = Number(s.total ?? 0);
    const replied = Number(s.replied ?? 0);
    return {
      connection,
      average_rating: typeof gbp.average_rating === "number" ? gbp.average_rating : null,
      total_reviews_on_google: typeof gbp.total_reviews === "number" ? gbp.total_reviews : null,
      synced_reviews: total,
      replied_reviews: replied,
      awaiting_approval: Number(s.awaiting ?? 0),
      response_rate_percent: total > 0 ? Math.round((replied / total) * 100) : null,
      median_reply_minutes: s.median_minutes === null || s.median_minutes === undefined ? null : Math.round(Number(s.median_minutes) * 10) / 10,
      last_synced_at: gbp.synced_at ?? null,
      top_seo_keywords: seoKeywords(profile),
    };
  }

  async listItems(workspaceId: string, itemType?: "review" | "local_post" | "photo_update"): Promise<GMapsItem[]> {
    const res = await this.db.query(
      `SELECT * FROM gmaps_reputation
        WHERE workspace_id = $1::uuid AND ($2::text IS NULL OR item_type = $2::text)
        ORDER BY COALESCE(review_created_at, created_at) DESC LIMIT 100`,
      [workspaceId, itemType ?? null],
    );
    return res.rows.map(mapRow);
  }

  private async draftReviewReply(workspaceId: string, profile: MerchantProfile, review: { author: string; rating: number | null; comment: string }) {
    const keywords = seoKeywords(profile);
    const prompt = `Review mới trên Google Maps:
- Khách: ${review.author}
- Số sao: ${review.rating ?? "không rõ"}/5
- Nội dung: "${review.comment || "(khách chỉ chấm sao, không viết nội dung)"}"

Viết câu trả lời của quán (chỉ trả về nội dung câu trả lời).`;
    const result = await this.llm.generate(workspaceId, {
      agent: "gmaps_specialist",
      system: systemPromptFor("gmaps_specialist", profile),
      prompt,
      maxTokens: 400,
      billable: true,
    });
    const text = result.text.replace(/^["“]|["”]$/g, "").trim().slice(0, 700);
    return { text, keywords: keywords.filter((k) => text.toLowerCase().includes(k.toLowerCase())), provider: result.provider_used };
  }

  /**
   * Đồng bộ review từ Google, soạn trả lời và tự đăng những review an toàn.
   * Idempotent: review đã có trên DB không bị xử lý lại; review đã có trả lời trên Google thì giữ nguyên.
   */
  async syncAndAutoReplyAllReviews(workspaceId: string): Promise<{
    status: "ok" | "not_connected";
    detail?: string;
    fetched: number;
    new_reviews: number;
    auto_replied: number;
    awaiting_approval: number;
    failed: number;
  }> {
    const empty = { fetched: 0, new_reviews: 0, auto_replied: 0, awaiting_approval: 0, failed: 0 };
    if (!googleOAuthConfigured()) {
      return { status: "not_connected", detail: "Chưa kết nối Google Business Profile", ...empty };
    }
    const profile = await loadMerchantProfile(this.db, workspaceId);
    let ref: GbpLocationRef;
    try {
      ref = await this.resolveLocation(workspaceId, profile);
    } catch (err) {
      if (err instanceof GoogleNotConnectedError) return { status: "not_connected", detail: err.message, ...empty };
      throw err;
    }
    const { reviews, averageRating, totalReviewCount } = await listReviews(this.auth, ref, this.fetchImpl);
    await this.db.query(
      `INSERT INTO merchant_onboarding (workspace_id, parsed_refs) VALUES ($1::uuid, jsonb_build_object('gbp', $2::jsonb))
       ON CONFLICT (workspace_id) DO UPDATE
         SET parsed_refs = merchant_onboarding.parsed_refs || jsonb_build_object('gbp', COALESCE(merchant_onboarding.parsed_refs->'gbp', '{}'::jsonb) || $2::jsonb),
             updated_at = NOW()`,
      [workspaceId, JSON.stringify({ average_rating: averageRating, total_reviews: totalReviewCount, synced_at: new Date().toISOString() })],
    );

    const minRating = profile.settings.gmaps_auto_reply_min_rating ?? DEFAULT_MIN_AUTO_RATING;
    let newReviews = 0;
    let autoReplied = 0;
    let awaiting = 0;
    let failed = 0;

    for (const review of reviews) {
      const inserted = await this.db.query(
        `INSERT INTO gmaps_reputation (workspace_id, item_type, external_id, author_name, author_avatar, rating, content,
                                       reply_text, replied_at, reply_source, status, review_created_at, metadata)
         VALUES ($1::uuid, 'review', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
         ON CONFLICT (workspace_id, item_type, external_id) WHERE external_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [
          workspaceId,
          review.reviewId,
          review.reviewerName.slice(0, 250),
          review.reviewerPhoto ?? null,
          review.rating || null,
          review.comment,
          review.existingReply?.comment ?? null,
          review.existingReply?.updateTime ?? null,
          review.existingReply ? "google_existing" : null,
          review.existingReply ? "replied" : "pending",
          review.createTime,
          JSON.stringify({ gbp_name: review.name }),
        ],
      );
      if (inserted.rows.length > 0 && !review.existingReply) newReviews++;
    }

    // Xử lý mọi review chưa trả lời (kể cả review của lần đồng bộ trước bị lỗi LLM).
    const pending = (
      await this.db.query(
        `SELECT * FROM gmaps_reputation
          WHERE workspace_id = $1::uuid AND item_type = 'review' AND status = 'pending' AND external_id IS NOT NULL
          ORDER BY review_created_at ASC NULLS LAST LIMIT 25`,
        [workspaceId],
      )
    ).rows.map(mapRow);

    for (const item of pending) {
      const sentiment = classifySentiment(item.content, item.rating);
      let draft: { text: string; keywords: string[] };
      try {
        draft = await this.draftReviewReply(workspaceId, profile, { author: item.author_name, rating: item.rating, comment: item.content });
      } catch (err) {
        if (err instanceof LlmUnavailableError || (err instanceof AppError && ["LLM_NOT_CONFIGURED", "INSUFFICIENT_CREDITS"].includes(err.code))) {
          await this.db.query(`UPDATE gmaps_reputation SET error_message = $3, updated_at = NOW() WHERE workspace_id = $1::uuid AND id = $2`, [
            workspaceId,
            item.id,
            (err as Error).message.slice(0, 300),
          ]);
          failed++;
          // LLM hỏng/ hết credit: dừng vòng này, review vẫn ở 'pending' để lần sau xử lý tiếp.
          break;
        }
        throw err;
      }
      const safeToAutoPublish = (item.rating ?? 0) >= minRating && (sentiment.label === "positive" || sentiment.label === "neutral");
      if (safeToAutoPublish) {
        try {
          await gbpReply(this.auth, String(item.metadata.gbp_name), draft.text, this.fetchImpl);
          await this.db.query(
            `UPDATE gmaps_reputation SET reply_text = $3, draft_reply = NULL, replied_at = NOW(), reply_source = 'auto',
                    status = 'replied', seo_keywords = $4, error_message = NULL, updated_at = NOW(),
                    metadata = metadata || $5::jsonb
              WHERE workspace_id = $1::uuid AND id = $2`,
            [workspaceId, item.id, draft.text, draft.keywords, JSON.stringify({ sentiment: sentiment.label })],
          );
          autoReplied++;
        } catch (err) {
          await this.db.query(
            `UPDATE gmaps_reputation SET draft_reply = $3, status = 'failed', error_message = $4, updated_at = NOW() WHERE workspace_id = $1::uuid AND id = $2`,
            [workspaceId, item.id, draft.text, (err as Error).message.slice(0, 300)],
          );
          failed++;
        }
      } else {
        await this.db.query(
          `UPDATE gmaps_reputation SET draft_reply = $3, status = 'needs_approval', seo_keywords = $4, updated_at = NOW(),
                  metadata = metadata || $5::jsonb
            WHERE workspace_id = $1::uuid AND id = $2`,
          [workspaceId, item.id, draft.text, draft.keywords, JSON.stringify({ sentiment: sentiment.label, sentiment_matched: sentiment.matched })],
        );
        awaiting++;
        const icon = sentiment.label === "crisis" ? "🚨 NGUY CƠ PHỐT" : "⚠️ Review cần anh/chị duyệt";
        await alertOwner(
          profile,
          `${icon} — Google Maps\n${item.author_name} (${item.rating ?? "?"}★): "${item.content.slice(0, 300)}"\n\nBản nháp trả lời:\n${draft.text}\n\nVào mục Google Maps để duyệt hoặc sửa.`,
          this.fetchImpl,
        );
      }
    }

    return { status: "ok", fetched: reviews.length, new_reviews: newReviews, auto_replied: autoReplied, awaiting_approval: awaiting, failed };
  }

  /** Chủ quán duyệt (có thể sửa) câu trả lời rồi đăng lên Google. */
  async replyToReview(workspaceId: string, itemId: string, replyText?: string): Promise<GMapsItem> {
    const row = (
      await this.db.query(`SELECT * FROM gmaps_reputation WHERE workspace_id = $1::uuid AND id = $2::uuid AND item_type = 'review'`, [workspaceId, itemId])
    ).rows[0];
    if (!row) throw new AppError(404, "REVIEW_NOT_FOUND", "Review not found");
    const item = mapRow(row);
    const text = (replyText ?? item.draft_reply ?? "").trim();
    if (!text) throw new AppError(422, "REPLY_REQUIRED", "Cần nội dung trả lời (chưa có bản nháp)");
    if (text.length > 4000) throw new AppError(422, "REPLY_TOO_LONG", "Trả lời tối đa 4000 ký tự");
    const gbpName = item.metadata.gbp_name;
    if (typeof gbpName !== "string") throw new AppError(409, "REVIEW_NOT_FROM_GOOGLE", "Review này không có mã Google để trả lời");
    try {
      await gbpReply(this.auth, gbpName, text, this.fetchImpl);
    } catch (err) {
      if (err instanceof GoogleNotConnectedError) throw new AppError(409, "GOOGLE_NOT_CONNECTED", err.message);
      if (err instanceof GoogleApiError) throw new AppError(502, "GOOGLE_API_ERROR", err.message, undefined, { body: err.body });
      throw err;
    }
    const source = replyText && replyText.trim() !== item.draft_reply?.trim() ? "owner_manual" : "owner_approved";
    const updated = await this.db.query(
      `UPDATE gmaps_reputation SET reply_text = $3, replied_at = NOW(), reply_source = $4, status = 'replied',
              draft_reply = NULL, error_message = NULL, updated_at = NOW()
        WHERE workspace_id = $1::uuid AND id = $2::uuid RETURNING *`,
      [workspaceId, itemId, text, source],
    );
    return mapRow(updated.rows[0]);
  }

  /** AI viết Local Post từ ảnh món thật trong Drive (bản nháp; chưa đăng). */
  async draftLocalPostFromAsset(workspaceId: string, assetId: string): Promise<GMapsItem> {
    const asset = (
      await this.db.query(`SELECT * FROM drive_asset_queue WHERE workspace_id = $1::uuid AND id = $2::uuid`, [workspaceId, assetId])
    ).rows[0];
    if (!asset) throw new AppError(404, "ASSET_NOT_FOUND", "Không tìm thấy ảnh trong thư viện Drive");
    const profile = await loadMerchantProfile(this.db, workspaceId);
    const prompt = `Viết 1 bài Google Maps Local Post (2–3 câu, tối đa 700 ký tự, không hashtag) giới thiệu ảnh thật sau:
- Loại ảnh: ${asset.asset_type}
- Món/ chủ đề: ${asset.dish_name ?? "không rõ"}
- Mô tả: ${asset.flavor_notes ?? ""}
Kết bằng lời mời ghé quán hoặc đặt bàn. Chỉ trả về nội dung bài.`;
    const result = await this.llm.generate(workspaceId, {
      agent: "gmaps_specialist",
      system: systemPromptFor("content_planner", profile),
      prompt,
      maxTokens: 500,
      billable: true,
    });
    const summary = result.text.trim().slice(0, 1400);
    const keywords = seoKeywords(profile).filter((k) => summary.toLowerCase().includes(k.toLowerCase()));
    const inserted = await this.db.query(
      `INSERT INTO gmaps_reputation (workspace_id, item_type, author_name, content, seo_keywords, status, metadata)
       VALUES ($1::uuid, 'local_post', $2, $3, $4, 'draft', $5::jsonb) RETURNING *`,
      [workspaceId, `AI Google Maps (${result.provider_used})`, summary, keywords, JSON.stringify({ asset_id: assetId })],
    );
    return mapRow(inserted.rows[0]);
  }

  async createDraftLocalPost(workspaceId: string, content: string, assetId?: string): Promise<GMapsItem> {
    const text = content.trim();
    if (text.length < 10 || text.length > 1500) throw new AppError(422, "INVALID_POST", "Nội dung bài 10–1500 ký tự");
    const inserted = await this.db.query(
      `INSERT INTO gmaps_reputation (workspace_id, item_type, author_name, content, status, metadata)
       VALUES ($1::uuid, 'local_post', 'Chủ quán', $2, 'draft', $3::jsonb) RETURNING *`,
      [workspaceId, text, JSON.stringify(assetId ? { asset_id: assetId } : {})],
    );
    return mapRow(inserted.rows[0]);
  }

  /** Đăng Local Post (đã được người dùng duyệt) lên Google Maps; ảnh lấy từ thư viện Drive nếu có. */
  async publishLocalPost(workspaceId: string, itemId: string, cta: GbpCallToAction = "BOOK"): Promise<GMapsItem> {
    const row = (
      await this.db.query(`SELECT * FROM gmaps_reputation WHERE workspace_id = $1::uuid AND id = $2::uuid AND item_type = 'local_post'`, [workspaceId, itemId])
    ).rows[0];
    if (!row) throw new AppError(404, "POST_NOT_FOUND", "Local post not found");
    const item = mapRow(row);
    if (item.status === "published") return item;
    const profile = await loadMerchantProfile(this.db, workspaceId);
    const ref = await this.resolveLocation(workspaceId, profile).catch((err) => {
      if (err instanceof GoogleNotConnectedError) throw new AppError(409, "GOOGLE_NOT_CONNECTED", err.message);
      throw err;
    });
    const assetId = typeof item.metadata.asset_id === "string" ? item.metadata.asset_id : null;
    const photoUrl = assetId ? await assetPublicImageUrl(this.db, workspaceId, assetId) : undefined;
    const bookingUrl = profile.links.fanpage ?? undefined;
    try {
      const created = await createLocalPost(
        this.auth,
        ref,
        {
          summary: item.content,
          photoUrl: photoUrl ?? undefined,
          callToAction: cta === "CALL" || !bookingUrl ? { actionType: "CALL" } : { actionType: cta, url: bookingUrl },
        },
        this.fetchImpl,
      );
      const updated = await this.db.query(
        `UPDATE gmaps_reputation SET status = 'published', replied_at = NOW(), error_message = NULL, updated_at = NOW(),
                metadata = metadata || $3::jsonb WHERE workspace_id = $1::uuid AND id = $2::uuid RETURNING *`,
        [workspaceId, itemId, JSON.stringify({ gbp_post_name: created.name ?? null, search_url: created.searchUrl ?? null })],
      );
      if (assetId) {
        await this.db.query(`UPDATE drive_asset_queue SET status = 'published', updated_at = NOW() WHERE workspace_id = $1::uuid AND id = $2::uuid`, [workspaceId, assetId]);
      }
      return mapRow(updated.rows[0]);
    } catch (err) {
      await this.db.query(`UPDATE gmaps_reputation SET status = 'failed', error_message = $3, updated_at = NOW() WHERE workspace_id = $1::uuid AND id = $2::uuid`, [
        workspaceId,
        itemId,
        (err as Error).message.slice(0, 300),
      ]);
      if (err instanceof GoogleApiError) throw new AppError(502, "GOOGLE_API_ERROR", err.message, undefined, { body: err.body });
      throw err;
    }
  }

  /** Đẩy ảnh món/ không gian mới từ thư viện lên mục Ảnh của hồ sơ Maps. */
  async publishPhoto(workspaceId: string, assetId: string): Promise<{ google_media_name?: string }> {
    const asset = (await this.db.query(`SELECT * FROM drive_asset_queue WHERE workspace_id = $1::uuid AND id = $2::uuid`, [workspaceId, assetId])).rows[0];
    if (!asset) throw new AppError(404, "ASSET_NOT_FOUND", "Không tìm thấy ảnh");
    const url = await assetPublicImageUrl(this.db, workspaceId, assetId);
    if (!url) throw new AppError(409, "PUBLIC_MEDIA_URL_MISSING", "Cần PUBLIC_API_BASE_URL để Google tải được ảnh");
    const ref = await this.resolveLocation(workspaceId);
    const category = asset.asset_type === "space_ambiance" ? "INTERIOR" : asset.asset_type === "menu_board" ? "MENU" : "FOOD_AND_DRINK";
    const media = await uploadLocationPhoto(this.auth, ref, { sourceUrl: url, category, description: asset.dish_name ?? undefined }, this.fetchImpl);
    await this.db.query(
      `INSERT INTO gmaps_reputation (workspace_id, item_type, author_name, content, status, replied_at, metadata)
       VALUES ($1::uuid, 'photo_update', 'Agent Google Maps', $2, 'published', NOW(), $3::jsonb)`,
      [workspaceId, asset.dish_name ?? asset.file_name, JSON.stringify({ asset_id: assetId, google_media_name: media.name ?? null })],
    );
    return { google_media_name: media.name };
  }

  /** Cập nhật thực đơn trên Maps từ thực đơn trong hồ sơ quán (giá do chủ quán nhập). */
  async syncMenu(workspaceId: string): Promise<{ sections: number; items: number }> {
    const profile = await loadMerchantProfile(this.db, workspaceId);
    const menu = profile.settings.menu ?? [];
    if (menu.length === 0) throw new AppError(422, "MENU_EMPTY", "Hồ sơ quán chưa có thực đơn");
    const sections = new Map<string, { name: string; items: Array<{ name: string; description?: string; priceVnd?: number }> }>();
    for (const item of menu) {
      const key = item.category || "Món chính";
      if (!sections.has(key)) sections.set(key, { name: key, items: [] });
      sections.get(key)!.items.push({ name: item.name, description: item.description, priceVnd: item.price_vnd });
    }
    const ref = await this.resolveLocation(workspaceId, profile);
    await updateFoodMenu(this.auth, ref, [...sections.values()], this.fetchImpl);
    return { sections: sections.size, items: menu.length };
  }
}
