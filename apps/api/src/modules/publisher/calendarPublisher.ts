import type { Pool } from "pg";
import defaultPool from "../../lib/db";
import { AppError } from "../../lib/errors";
import type { FetchLike } from "../ai/providers";
import { assetPublicImageUrl } from "../assets/media";
import { CommunityHubService } from "../community/hub";
import { GoogleMapsSpecialistService } from "../gmaps/specialist";
import { loadMerchantProfile } from "../merchant/profile";
import { alertOwner } from "../merchant/notify";

/**
 * Agent 4 — Multi-Channel Publisher. Đăng các bài trong lịch đã được duyệt khi tới giờ hẹn:
 * Facebook Page (Graph API /photos hoặc /feed), Instagram (container → media_publish), Google Maps
 * (Local Post), Group Facebook (Group Bot), TikTok (worker dựng video carousel 720x1280 rồi đăng).
 *
 * Retry có giới hạn: lỗi tạm thời thử lại sau 5 → 15 → 45 → 120 phút; quá 5 lần hoặc lỗi cấu hình
 * (chưa kết nối kênh) → failed và báo chủ quán. Bài đang 'publishing' bị khóa, không đăng trùng.
 */
const BACKOFF_MINUTES = [5, 15, 45, 120];
const MAX_ATTEMPTS = 5;

export class PublishConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishConfigError";
  }
}

interface DueEntry {
  id: string;
  workspace_id: string;
  channel: string;
  format: string;
  caption: string;
  hashtags: string[];
  call_to_action: string | null;
  asset_ids: string[];
  scheduled_at: string;
  metadata: Record<string, unknown>;
}

function graphVersion(): string {
  const v = process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v21.0";
  return /^v\d+\.\d+$/.test(v) ? v : "v21.0";
}

export function composeText(entry: Pick<DueEntry, "caption" | "hashtags" | "call_to_action" | "channel">): string {
  const tags = entry.hashtags.filter(Boolean).join(" ");
  const parts = [entry.caption.trim()];
  if (entry.call_to_action && entry.channel !== "instagram" && !entry.caption.includes(entry.call_to_action)) parts.push(`👉 ${entry.call_to_action}`);
  if (tags && entry.channel !== "google_maps") parts.push(tags);
  return parts.join("\n\n");
}

async function graphPost(fetchImpl: FetchLike, path: string, params: Record<string, string>): Promise<any> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!token) throw new PublishConfigError("Thiếu FACEBOOK_PAGE_ACCESS_TOKEN");
  const res = await fetchImpl(`https://graph.facebook.com/${graphVersion()}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: token }).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; post_id?: string; error?: { message?: string; code?: number } };
  if (!res.ok || body.error) {
    const msg = `Graph ${path} HTTP ${res.status}: ${body.error?.message ?? "unknown"}`;
    // 190 = token hết hạn/ sai; 10/200 = thiếu quyền → lỗi cấu hình, không retry
    if (body.error?.code === 190 || body.error?.code === 10 || body.error?.code === 200) throw new PublishConfigError(msg);
    throw new Error(msg);
  }
  return body;
}

async function graphGet(fetchImpl: FetchLike, path: string): Promise<any> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  const res = await fetchImpl(`https://graph.facebook.com/${graphVersion()}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token ?? "")}`, {
    signal: AbortSignal.timeout(15_000),
  });
  return res.json().catch(() => ({}));
}

export class CalendarPublisherService {
  constructor(
    private readonly db: Pool = defaultPool,
    private readonly fetchImpl: FetchLike = (u, i) => fetch(u, i),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private async imageUrls(workspaceId: string, assetIds: string[]): Promise<string[]> {
    const urls: string[] = [];
    for (const id of assetIds) {
      const url = await assetPublicImageUrl(this.db, workspaceId, id);
      if (url) urls.push(url);
    }
    return urls;
  }

  private async publishFacebook(entry: DueEntry): Promise<{ id: string; url?: string }> {
    const pageId = process.env.FACEBOOK_PAGE_ID?.trim();
    if (!pageId) throw new PublishConfigError("Thiếu FACEBOOK_PAGE_ID");
    const [imageUrl] = await this.imageUrls(entry.workspace_id, entry.asset_ids);
    const message = composeText(entry);
    const body = imageUrl
      ? await graphPost(this.fetchImpl, `${pageId}/photos`, { url: imageUrl, caption: message, published: "true" })
      : await graphPost(this.fetchImpl, `${pageId}/feed`, { message });
    const id = body.post_id ?? body.id;
    return { id, url: id ? `https://www.facebook.com/${id}` : undefined };
  }

  private async publishInstagram(entry: DueEntry): Promise<{ id: string; url?: string }> {
    const igId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
    if (!igId) throw new PublishConfigError("Chưa liên kết Instagram Business (INSTAGRAM_BUSINESS_ACCOUNT_ID)");
    const [imageUrl] = await this.imageUrls(entry.workspace_id, entry.asset_ids);
    if (!imageUrl) throw new PublishConfigError("Instagram bắt buộc có ảnh: bài này chưa có ảnh từ thư viện Drive");
    const container = await graphPost(this.fetchImpl, `${igId}/media`, { image_url: imageUrl, caption: composeText(entry).slice(0, 2200) });
    // Container ảnh thường sẵn sàng ngay, nhưng Instagram yêu cầu kiểm tra status_code trước khi publish.
    for (let i = 0; i < 6; i++) {
      const status = await graphGet(this.fetchImpl, `${container.id}?fields=status_code`);
      if (status.status_code === "FINISHED" || status.status_code === undefined) break;
      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") throw new Error(`Instagram container ${status.status_code}`);
      await this.sleep(2_000);
    }
    const published = await graphPost(this.fetchImpl, `${igId}/media_publish`, { creation_id: container.id });
    const info = await graphGet(this.fetchImpl, `${published.id}?fields=permalink`).catch(() => ({}));
    return { id: published.id, url: info?.permalink };
  }

  private async publishGoogleMaps(entry: DueEntry): Promise<{ id: string; url?: string }> {
    const gmaps = new GoogleMapsSpecialistService({ db: this.db, fetch: this.fetchImpl });
    const draft = await gmaps.createDraftLocalPost(entry.workspace_id, composeText(entry).slice(0, 1500), entry.asset_ids[0]);
    try {
      const post = await gmaps.publishLocalPost(entry.workspace_id, draft.id, "BOOK");
      return { id: String(post.metadata.gbp_post_name ?? post.id), url: typeof post.metadata.search_url === "string" ? post.metadata.search_url : undefined };
    } catch (err) {
      if (err instanceof AppError && err.code === "GOOGLE_NOT_CONNECTED") throw new PublishConfigError(err.message);
      throw err;
    }
  }

  private async publishGroup(entry: DueEntry): Promise<{ id: string; url?: string }> {
    const hub = new CommunityHubService(this.db);
    const [imageUrl] = await this.imageUrls(entry.workspace_id, entry.asset_ids);
    const result = await hub.postToGroupViaBot(entry.workspace_id, {
      title: (entry.caption.split("\n")[0] || "Bài cộng đồng").slice(0, 120),
      body: composeText(entry),
      image_url: imageUrl,
      source_id: `calendar:${entry.id}`,
    });
    if (!result.success) {
      if (/session|login|đăng nhập/i.test(result.message)) throw new PublishConfigError(`Group Bot: ${result.message}`);
      throw new Error(`Group Bot: ${result.message}`);
    }
    return { id: result.externalPostId ?? result.postUrl ?? `group:${entry.id}`, url: result.postUrl };
  }

  /** TikTok: giao cho worker dựng video carousel (cần ffmpeg) và đăng; kết quả được đối soát ở reconcileTikTok. */
  private async queueTikTok(entry: DueEntry): Promise<"queued"> {
    const urls = await this.imageUrls(entry.workspace_id, entry.asset_ids);
    if (urls.length < 3) throw new PublishConfigError("Video carousel TikTok cần ít nhất 3 ảnh thật trong thư viện");
    const profile = await loadMerchantProfile(this.db, entry.workspace_id);
    await this.db.query(
      `INSERT INTO outbox_events (workspace_id, event_type, dedup_key, payload, status, retry_count)
       VALUES ($1::uuid, 'merchant.tiktok.carousel', $2, $3::jsonb, 'pending', 0)
       ON CONFLICT (workspace_id, dedup_key) DO UPDATE SET status = 'pending', retry_count = 0, payload = EXCLUDED.payload`,
      [
        entry.workspace_id,
        `tiktok-carousel:${entry.id}`,
        JSON.stringify({
          calendar_entry_id: entry.id,
          image_urls: urls.slice(0, 5),
          caption: composeText(entry).slice(0, 2200),
          title: entry.caption.split("\n")[0].slice(0, 80),
          brand: profile.businessName,
          music_path: process.env.TIKTOK_MUSIC_PATH?.trim() || null,
        }),
      ],
    );
    return "queued";
  }

  /** Nhận các bài tới giờ và đăng; trả thống kê. Khóa từng bài bằng UPDATE ... RETURNING. */
  async publishDue(workspaceId: string, limit = 10): Promise<{ published: number; queued: number; retrying: number; failed: number }> {
    const claimed = (
      await this.db.query(
        `UPDATE content_calendar_entries SET status = 'publishing', updated_at = NOW()
          WHERE id IN (
            SELECT id FROM content_calendar_entries
             WHERE workspace_id = $1::uuid AND status = 'approved' AND scheduled_at <= NOW()
               AND (metadata->>'next_attempt_at' IS NULL OR (metadata->>'next_attempt_at')::timestamptz <= NOW())
             ORDER BY scheduled_at LIMIT $2 FOR UPDATE SKIP LOCKED)
          RETURNING *`,
        [workspaceId, limit],
      )
    ).rows as DueEntry[];
    const stats = { published: 0, queued: 0, retrying: 0, failed: 0 };
    for (const entry of claimed) {
      try {
        if (entry.channel === "tiktok") {
          await this.queueTikTok(entry);
          await this.db.query(`UPDATE content_calendar_entries SET metadata = metadata || '{"tiktok_queued": true}'::jsonb WHERE id = $1`, [entry.id]);
          stats.queued++;
          continue;
        }
        const result =
          entry.channel === "facebook"
            ? await this.publishFacebook(entry)
            : entry.channel === "instagram"
              ? await this.publishInstagram(entry)
              : entry.channel === "google_maps"
                ? await this.publishGoogleMaps(entry)
                : entry.channel === "facebook_group"
                  ? await this.publishGroup(entry)
                  : (() => {
                      throw new PublishConfigError(`Kênh ${entry.channel} chưa hỗ trợ`);
                    })();
        await this.db.query(
          `UPDATE content_calendar_entries SET status = 'published', published_at = NOW(), external_post_id = $2, error_message = NULL,
                  metadata = metadata || $3::jsonb, updated_at = NOW() WHERE id = $1`,
          [entry.id, result.id, JSON.stringify({ post_url: result.url ?? null })],
        );
        if (entry.asset_ids.length > 0) {
          await this.db.query(`UPDATE drive_asset_queue SET status = 'published', updated_at = NOW() WHERE workspace_id = $1::uuid AND id = ANY($2::uuid[])`, [
            workspaceId,
            entry.asset_ids,
          ]);
        }
        stats.published++;
      } catch (err) {
        const attempts = Number(entry.metadata?.attempts ?? 0) + 1;
        const permanent = err instanceof PublishConfigError || attempts >= MAX_ATTEMPTS;
        const message = (err as Error).message.slice(0, 400);
        const next = permanent ? null : new Date(Date.now() + BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] * 60_000).toISOString();
        await this.db.query(
          `UPDATE content_calendar_entries SET status = $2, error_message = $3,
                  metadata = metadata || jsonb_build_object('attempts', $4::int, 'next_attempt_at', $5::text), updated_at = NOW()
            WHERE id = $1`,
          [entry.id, permanent ? "failed" : "approved", message, attempts, next],
        );
        if (permanent) {
          stats.failed++;
          const profile = await loadMerchantProfile(this.db, workspaceId);
          await alertOwner(profile, `❌ Không đăng được bài ${entry.channel} lúc ${new Date(entry.scheduled_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}:\n${message}`);
        } else {
          stats.retrying++;
        }
      }
    }
    return stats;
  }

  /** Đối soát bài TikTok worker đã xử lý (outbox merchant.tiktok.carousel → published/failed). */
  async reconcileTikTok(workspaceId: string): Promise<number> {
    const rows = (
      await this.db.query(
        `SELECT c.id, e.status AS event_status, e.payload
           FROM content_calendar_entries c
           JOIN outbox_events e ON e.workspace_id = c.workspace_id AND e.dedup_key = 'tiktok-carousel:' || c.id::text
          WHERE c.workspace_id = $1::uuid AND c.channel = 'tiktok' AND c.status = 'publishing' AND e.status IN ('published', 'failed')`,
        [workspaceId],
      )
    ).rows;
    for (const row of rows) {
      const result = (row.payload?.result ?? {}) as { publish_id?: string; error?: string };
      await this.db.query(
        `UPDATE content_calendar_entries SET status = $2::text, published_at = CASE WHEN $2::text = 'published' THEN NOW() ELSE published_at END,
                external_post_id = COALESCE($3, external_post_id), error_message = $4, updated_at = NOW() WHERE id = $1`,
        [row.id, row.event_status === "published" ? "published" : "failed", result.publish_id ?? null, row.event_status === "failed" ? result.error ?? "TikTok publish failed" : null],
      );
    }
    return rows.length;
  }
}
