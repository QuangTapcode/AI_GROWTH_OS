import { spawn } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Pool } from "pg";
import { AppError } from "../../lib/errors";
import { downloadDriveFile, drivePublicImageUrl } from "../google/drive";
import type { GoogleAuth } from "../google/oauth";
import { workspaceGoogleAuth } from "../google/connection";
import { loadMerchantProfile } from "../merchant/profile";

/**
 * Ảnh dùng để đăng bài: tải ảnh gốc từ Drive, gắn watermark logo quán, lưu cache và phục vụ qua
 * link có chữ ký (Facebook/Instagram/Google tải ảnh bằng URL công khai, không gửi được Bearer token).
 */
const WINDOW_MS = 24 * 3600_000;
const LIFETIME_MS = 7 * 24 * 3600_000;

function signingSecret(): string {
  const secret = process.env.MEDIA_SIGNING_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("MEDIA_SIGNING_SECRET or AUTH_SECRET must be set to sign media links");
  return secret;
}

function signature(workspaceId: string, assetId: string, exp: number): string {
  return createHmac("sha256", signingSecret()).update(`asset:${workspaceId}:${assetId}:${exp}`).digest("hex").slice(0, 40);
}

export function signedAssetPath(workspaceId: string, assetId: string, now = Date.now()): string {
  // Ổn định trong 1 cửa sổ 24h để nền tảng cache được cùng một URL.
  const exp = Math.floor(now / WINDOW_MS) * WINDOW_MS + LIFETIME_MS;
  return `/public/media/assets/${assetId}?ws=${workspaceId}&exp=${exp}&sig=${signature(workspaceId, assetId, exp)}`;
}

export function verifyAssetSignature(workspaceId: string, assetId: string, exp: number, sig: string, now = Date.now()): boolean {
  if (!Number.isFinite(exp) || exp < now || exp > now + LIFETIME_MS + WINDOW_MS) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(signature(workspaceId, assetId, exp));
  } catch {
    return false; // chưa cấu hình khóa ký: từ chối mọi link
  }
  const actual = Buffer.from(sig || "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** URL công khai của ảnh đã gắn watermark; null nếu không có cách nào để nền tảng tải ảnh. */
export async function assetPublicImageUrl(db: Pick<Pool, "query">, workspaceId: string, assetId: string): Promise<string | null> {
  const asset = (
    await db.query(`SELECT id, drive_file_id, file_url FROM drive_asset_queue WHERE workspace_id = $1::uuid AND id = $2::uuid`, [workspaceId, assetId])
  ).rows[0];
  if (!asset) return null;
  const base = process.env.PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "");
  if (base) return `${base}${signedAssetPath(workspaceId, assetId)}`;
  // Không có domain công khai cho API: dùng link Drive (thư mục phải được chia sẻ công khai), không watermark.
  if (asset.drive_file_id) return drivePublicImageUrl(asset.drive_file_id);
  return /^https:\/\//.test(asset.file_url ?? "") ? asset.file_url : null;
}

export function mediaCacheDir(): string {
  const dir = process.env.MEDIA_CACHE_DIR?.trim() || path.join(os.tmpdir(), "agos-media");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function runWatermark(config: Record<string, unknown>): Promise<void> {
  const python = process.env.PYTHON_BIN?.trim() || "python";
  const script = path.resolve(process.cwd(), "scripts/media/watermark_image.py");
  const fallbackScript = path.resolve(__dirname, "../../../scripts/media/watermark_image.py");
  const scriptPath = fs.existsSync(script) ? script : fallbackScript;
  return new Promise((resolve, reject) => {
    const child = spawn(python, [scriptPath], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("watermark timed out"));
    }, 30_000);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`watermark failed (${code}): ${(stdout || stderr).slice(0, 300)}`));
    });
    child.stdin.end(JSON.stringify(config));
  });
}

async function fetchLogo(logoUrl: string | undefined, cacheDir: string, workspaceId: string): Promise<string | null> {
  if (!logoUrl) return null;
  const target = path.join(cacheDir, `logo-${workspaceId}.png`);
  if (fs.existsSync(target) && Date.now() - fs.statSync(target).mtimeMs < 24 * 3600_000) return target;
  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    return target;
  } catch {
    return null;
  }
}

/** Đường dẫn file JPEG đã watermark của asset (tạo nếu chưa có trong cache). */
export async function renderWatermarkedAsset(
  db: Pick<Pool, "query">,
  workspaceId: string,
  assetId: string,
  authOverride?: GoogleAuth,
): Promise<string> {
  const auth = authOverride ?? (await workspaceGoogleAuth(db, workspaceId));
  const asset = (
    await db.query(`SELECT id, drive_file_id, file_name, updated_at FROM drive_asset_queue WHERE workspace_id = $1::uuid AND id = $2::uuid`, [workspaceId, assetId])
  ).rows[0];
  if (!asset) throw new AppError(404, "ASSET_NOT_FOUND", "Asset not found");
  if (!asset.drive_file_id) throw new AppError(409, "ASSET_HAS_NO_SOURCE", "Asset has no Drive source file");
  const dir = mediaCacheDir();
  const output = path.join(dir, `${assetId}.jpg`);
  if (fs.existsSync(output)) return output;

  const raw = path.join(dir, `${assetId}.src`);
  fs.writeFileSync(raw, await downloadDriveFile(auth, asset.drive_file_id));
  const profile = await loadMerchantProfile(db, workspaceId);
  const logoAsset = (
    await db.query(`SELECT drive_file_id FROM drive_asset_queue WHERE workspace_id = $1::uuid AND asset_type = 'logo' AND drive_file_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1`, [workspaceId])
  ).rows[0];
  let logoPath = await fetchLogo(profile.settings.logo_url, dir, workspaceId);
  if (!logoPath && logoAsset?.drive_file_id) {
    logoPath = path.join(dir, `logo-${workspaceId}-drive.png`);
    if (!fs.existsSync(logoPath)) fs.writeFileSync(logoPath, await downloadDriveFile(auth, logoAsset.drive_file_id));
  }
  try {
    await runWatermark({ input: raw, output, logo: logoPath, text: profile.businessName, position: "bottom_right", max_side: 1600 });
  } finally {
    fs.rmSync(raw, { force: true });
  }
  return output;
}
