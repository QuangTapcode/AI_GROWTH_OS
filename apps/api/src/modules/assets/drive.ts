import type { Pool } from "pg";
import { z } from "zod";
import defaultPool from "../../lib/db";
import { AppError } from "../../lib/errors";
import { LlmUnavailableError, MultiLLMAdapterService, parseJsonReply } from "../ai/llmAdapter";
import type { FetchLike } from "../ai/providers";
import { downloadDriveFile, listDriveImages, parseDriveFolderId, MAX_IMAGE_BYTES, type DriveImageFile } from "../google/drive";
import { googleOAuthConfigured, type GoogleAuth } from "../google/oauth";
import { googleUserTokenAvailable, workspaceGoogleAuth } from "../google/connection";
import { loadMerchantProfile } from "../merchant/profile";
import { systemPromptFor } from "../merchant/prompts";

/**
 * Agent 2 — Drive Asset Ingestion.
 * Quét thư mục Google Drive của quán (worker gọi mỗi 20 phút), tải ảnh mới, dùng LLM thị giác
 * (Gemini Vision → OpenAI/Claude khi Gemini lỗi) nhận diện món/ không gian và viết caption gợi thèm.
 * Ảnh tên bắt đầu bằng "logo" được dùng làm watermark, không đăng.
 */
export type AssetType = "food_photo" | "drink_photo" | "space_ambiance" | "menu_board" | "people_event" | "logo" | "other";
export type AssetStatus = "pending_analysis" | "staged" | "rejected" | "scheduled" | "published" | "archived";

export interface DriveAsset {
  id: string;
  workspace_id: string;
  file_name: string;
  file_url: string;
  drive_file_id: string | null;
  mime_type: string | null;
  asset_type: AssetType;
  vision_tags: string[];
  dish_name: string | null;
  flavor_notes: string | null;
  generated_caption: string | null;
  suggested_channels: string[];
  quality: string | null;
  status: AssetStatus;
  analysis_provider: string | null;
  error_message: string | null;
  folder_name: string | null;
  created_at: string;
  updated_at: string;
}

const visionSchema = z.object({
  asset_type: z.enum(["food_photo", "drink_photo", "space_ambiance", "menu_board", "people_event", "other"]),
  dish_name: z.string().trim().max(200).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  flavor_notes: z.string().trim().max(500).nullable().optional(),
  caption: z.string().trim().max(600).nullable().optional(),
  quality: z.enum(["good", "blurry", "dark", "not_relevant"]).default("good"),
  suggested_channels: z.array(z.enum(["facebook", "instagram", "google_maps", "tiktok", "facebook_group"])).max(5).optional(),
});
export type VisionResult = z.infer<typeof visionSchema>;

const SUPPORTED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_ANALYSES_PER_SCAN = 10;

function mapRow(row: any): DriveAsset {
  const analysis = (row.analysis ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    file_name: row.file_name,
    file_url: row.file_url,
    drive_file_id: row.drive_file_id ?? null,
    mime_type: row.mime_type ?? null,
    asset_type: row.asset_type,
    vision_tags: Array.isArray(row.vision_tags) ? row.vision_tags : typeof row.vision_tags === "string" ? JSON.parse(row.vision_tags) : [],
    dish_name: row.dish_name ?? null,
    flavor_notes: row.flavor_notes ?? null,
    generated_caption: row.generated_caption ?? null,
    suggested_channels: Array.isArray(row.suggested_channels) ? row.suggested_channels : [],
    quality: typeof analysis.quality === "string" ? analysis.quality : null,
    status: row.status,
    analysis_provider: row.analysis_provider ?? null,
    error_message: row.error_message ?? null,
    folder_name: typeof analysis.folder_name === "string" ? analysis.folder_name : null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

export interface DriveScanResult {
  status: "ok" | "not_configured" | "not_connected";
  detail?: string;
  listed: number;
  new_files: number;
  analyzed: number;
  rejected: number;
  failed: number;
  remaining: number;
}

export interface DriveDeps {
  db?: Pick<Pool, "query">;
  llm?: MultiLLMAdapterService;
  auth?: GoogleAuth;
  fetch?: FetchLike;
}

export class DriveAssetIngestionService {
  private readonly db: Pick<Pool, "query">;
  private readonly llm: MultiLLMAdapterService;
  private readonly authOverride?: GoogleAuth;
  private readonly fetchImpl?: FetchLike;

  constructor(deps: DriveDeps | Pick<Pool, "query"> = {}) {
    const d: DriveDeps = "query" in deps ? { db: deps as Pick<Pool, "query"> } : (deps as DriveDeps);
    this.db = d.db ?? defaultPool;
    this.llm = d.llm ?? new MultiLLMAdapterService(this.db);
    this.authOverride = d.auth;
    this.fetchImpl = d.fetch;
  }

  /** The workspace's own Google account (Kết nối Google) first, then the server-wide credentials. */
  private authFor(workspaceId: string): Promise<GoogleAuth> {
    return this.authOverride ? Promise.resolve(this.authOverride) : workspaceGoogleAuth(this.db, workspaceId, this.fetchImpl);
  }

  async listAssets(workspaceId: string, status?: AssetStatus): Promise<DriveAsset[]> {
    const res = await this.db.query(
      `SELECT * FROM drive_asset_queue WHERE workspace_id = $1::uuid AND ($2::text IS NULL OR status = $2::text)
        ORDER BY COALESCE(drive_modified_at, created_at) DESC LIMIT 200`,
      [workspaceId, status ?? null],
    );
    return res.rows.map(mapRow);
  }

  /** Giữ tên cũ cho UI: ảnh đã phân tích và sẵn sàng đăng/ lên lịch. */
  async listStagedAssets(workspaceId: string): Promise<DriveAsset[]> {
    return this.listAssets(workspaceId);
  }

  async connection(workspaceId: string): Promise<{ folder_id: string | null; connected: boolean; reason?: string }> {
    const profile = await loadMerchantProfile(this.db, workspaceId);
    const folderId = parseDriveFolderId(profile.links.gdrive);
    if (!folderId) return { folder_id: null, connected: false, reason: "Chưa có link thư mục Google Drive hợp lệ trong mục Kết nối" };
    const auth = await this.authFor(workspaceId);
    const userToken = this.authOverride ? googleOAuthConfigured() : await googleUserTokenAvailable(this.db, workspaceId);
    if (!userToken && !auth.apiKey()) {
      return { folder_id: folderId, connected: false, reason: "Chưa kết nối Google: bấm “Kết nối Google” để cấp quyền đọc thư mục Drive" };
    }
    return { folder_id: folderId, connected: true };
  }

  private async analyzeImage(workspaceId: string, file: { name: string; mimeType: string; folderName?: string }, bytes: Buffer): Promise<{ result: VisionResult; provider: string }> {
    const profile = await loadMerchantProfile(this.db, workspaceId);
    const prompt = `Phân tích ảnh "${file.name}"${file.folderName ? ` (thư mục "${file.folderName}")` : ""}.
Trả về JSON với các khóa: asset_type, dish_name, tags (3-8 thẻ tiếng Việt), flavor_notes, caption, quality, suggested_channels.`;
    const reply = await this.llm.generate(workspaceId, {
      agent: "asset_manager",
      system: systemPromptFor("asset_manager", profile),
      prompt,
      images: [{ mimeType: file.mimeType === "image/heif" ? "image/heic" : file.mimeType, base64: bytes.toString("base64") }],
      json: true,
      maxTokens: 700,
      timeoutMs: 45_000,
      billable: true,
    });
    const parsed = visionSchema.safeParse(parseJsonReply(reply.text));
    if (!parsed.success) throw new Error(`Vision JSON không hợp lệ: ${parsed.error.issues[0]?.message ?? "unknown"}`);
    return { result: parsed.data, provider: reply.provider_used };
  }

  /** Lưu (hoặc cập nhật nếu file trên Drive đã đổi) bản ghi của ảnh; true nếu đây là ảnh nội dung mới. */
  private async upsertFile(workspaceId: string, file: DriveImageFile): Promise<boolean> {
    const isLogo = /^logo/i.test(file.name);
    const res = await this.db.query(
      `INSERT INTO drive_asset_queue (workspace_id, file_name, file_url, drive_file_id, mime_type, drive_modified_at, thumbnail_url,
                                      asset_type, status, analysis)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       ON CONFLICT (workspace_id, drive_file_id) WHERE drive_file_id IS NOT NULL DO UPDATE
         SET file_name = EXCLUDED.file_name, mime_type = EXCLUDED.mime_type, thumbnail_url = EXCLUDED.thumbnail_url,
             drive_modified_at = EXCLUDED.drive_modified_at,
             status = CASE WHEN drive_asset_queue.drive_modified_at IS DISTINCT FROM EXCLUDED.drive_modified_at
                            AND drive_asset_queue.status IN ('staged', 'rejected', 'pending_analysis')
                           THEN EXCLUDED.status ELSE drive_asset_queue.status END,
             updated_at = NOW()
       RETURNING id, status, (xmax = 0) AS inserted`,
      [
        workspaceId,
        file.name.slice(0, 250),
        file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
        file.id,
        file.mimeType,
        file.modifiedTime,
        file.thumbnailLink ?? null,
        isLogo ? "logo" : "other",
        isLogo ? "archived" : "pending_analysis",
        JSON.stringify(file.folderName ? { folder_name: file.folderName } : {}),
      ],
    );
    const row = res.rows[0];
    return !isLogo && Boolean(row?.inserted);
  }

  async scanDrive(workspaceId: string): Promise<DriveScanResult> {
    const base = { listed: 0, new_files: 0, analyzed: 0, rejected: 0, failed: 0, remaining: 0 };
    const conn = await this.connection(workspaceId);
    if (!conn.folder_id) return { status: "not_configured", detail: conn.reason, ...base };
    if (!conn.connected) return { status: "not_connected", detail: conn.reason, ...base };

    const auth = await this.authFor(workspaceId);
    const files = await listDriveImages(auth, conn.folder_id, this.fetchImpl);
    let newFiles = 0;
    for (const file of files) {
      if (await this.upsertFile(workspaceId, file)) newFiles++;
    }
    const pending = (
      await this.db.query(
        `SELECT * FROM drive_asset_queue WHERE workspace_id = $1::uuid AND status = 'pending_analysis' AND drive_file_id IS NOT NULL
          ORDER BY drive_modified_at DESC NULLS LAST`,
        [workspaceId],
      )
    ).rows;

    let analyzed = 0;
    let rejected = 0;
    let failed = 0;
    for (const row of pending.slice(0, MAX_ANALYSES_PER_SCAN)) {
      const mime = String(row.mime_type ?? "");
      if (!SUPPORTED_MIME.has(mime)) {
        await this.db.query(`UPDATE drive_asset_queue SET status = 'rejected', error_message = $3, updated_at = NOW() WHERE workspace_id = $1::uuid AND id = $2`, [
          workspaceId,
          row.id,
          `Định dạng ${mime || "không rõ"} chưa hỗ trợ`,
        ]);
        rejected++;
        continue;
      }
      try {
        const bytes = await downloadDriveFile(auth, row.drive_file_id, this.fetchImpl);
        const { result, provider } = await this.analyzeImage(workspaceId, { name: row.file_name, mimeType: mime, folderName: row.analysis?.folder_name }, bytes);
        const usable = result.quality === "good";
        await this.db.query(
          `UPDATE drive_asset_queue
              SET asset_type = $3, dish_name = $4, flavor_notes = $5, generated_caption = $6, vision_tags = $7::jsonb,
                  suggested_channels = $8, analysis = analysis || $9::jsonb, analysis_provider = $10,
                  status = $11, error_message = $12, updated_at = NOW()
            WHERE workspace_id = $1::uuid AND id = $2`,
          [
            workspaceId,
            row.id,
            result.asset_type,
            result.dish_name ?? null,
            result.flavor_notes ?? null,
            result.caption ?? null,
            JSON.stringify(result.tags),
            result.suggested_channels ?? ["facebook", "instagram", "google_maps"],
            JSON.stringify({ quality: result.quality, analyzed_at: new Date().toISOString() }),
            provider,
            usable ? "staged" : "rejected",
            usable ? null : `Ảnh ${result.quality === "blurry" ? "bị mờ" : result.quality === "dark" ? "quá tối" : "không liên quan tới quán"} — không nên đăng`,
          ],
        );
        if (usable) analyzed++;
        else rejected++;
      } catch (err) {
        failed++;
        const message = (err as Error).message.slice(0, 300);
        const tooLarge = /quá lớn|413/.test(message);
        await this.db.query(`UPDATE drive_asset_queue SET status = $3, error_message = $4, updated_at = NOW() WHERE workspace_id = $1::uuid AND id = $2`, [
          workspaceId,
          row.id,
          tooLarge ? "rejected" : "pending_analysis",
          tooLarge ? `Ảnh lớn hơn ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB — hãy nén ảnh trước khi đưa vào Drive` : message,
        ]);
        // LLM toàn bộ đang lỗi/ hết credit: dừng sớm, lần quét sau làm tiếp.
        if (err instanceof LlmUnavailableError || (err instanceof AppError && ["LLM_NOT_CONFIGURED", "INSUFFICIENT_CREDITS"].includes(err.code))) break;
      }
    }
    return {
      status: "ok",
      listed: files.length,
      new_files: newFiles,
      analyzed,
      rejected,
      failed,
      remaining: Math.max(0, pending.length - analyzed - rejected - failed),
    };
  }

  /** Giữ tên cũ cho route /assets/drive/sync. */
  async syncDriveFolder(workspaceId: string): Promise<DriveScanResult> {
    return this.scanDrive(workspaceId);
  }

  async getAsset(workspaceId: string, assetId: string): Promise<DriveAsset> {
    const row = (await this.db.query(`SELECT * FROM drive_asset_queue WHERE workspace_id = $1::uuid AND id = $2::uuid`, [workspaceId, assetId])).rows[0];
    if (!row) throw new AppError(404, "ASSET_NOT_FOUND", "Không tìm thấy ảnh");
    return mapRow(row);
  }

  async setStatus(workspaceId: string, assetId: string, status: AssetStatus): Promise<DriveAsset> {
    const row = (
      await this.db.query(`UPDATE drive_asset_queue SET status = $3, updated_at = NOW() WHERE workspace_id = $1::uuid AND id = $2::uuid RETURNING *`, [
        workspaceId,
        assetId,
        status,
      ])
    ).rows[0];
    if (!row) throw new AppError(404, "ASSET_NOT_FOUND", "Không tìm thấy ảnh");
    return mapRow(row);
  }
}
