import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { query, withTransaction } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { getEnvironment } from "../../lib/env";
import { canonicalJson, sha256Hex } from "../../lib/hash";
import type { Role } from "../../lib/tenant";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const VALID_PRIVACY_LEVELS = [
  "SELF_ONLY",
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
] as const;

export type TikTokPrivacyLevel = (typeof VALID_PRIVACY_LEVELS)[number];

export interface TikTokConnectionSummary {
  connected: boolean;
  expired: boolean;
  open_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  scopes: string[];
  expires_at: string | null;
  refresh_expires_at: string | null;
  sandbox_privacy_default: TikTokPrivacyLevel;
}

export interface TikTokVideoRow {
  id: string;
  workspace_id: string;
  title: string;
  caption: string;
  hashtags: string[];
  source_artifact_id: string | null;
  video_source_type: "file_upload" | "url";
  file_size_bytes: number | null;
  media_url: string | null;
  privacy_level: string;
  is_aigc: boolean;
  status: string;
  artifact_id: string | null;
  publishing_job_id: string | null;
  tiktok_publish_id: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  job_status?: string | null;
  job_scheduled_for?: string | null;
  job_published_at?: string | null;
  job_external_post_id?: string | null;
  job_error_message?: string | null;
}

interface TikTokTokenDbRow {
  id: string;
  workspace_id: string;
  open_id: string;
  display_name: string | null;
  avatar_url: string | null;
  encrypted_access_token: string;
  encrypted_refresh_token: string | null;
  scopes: string[];
  expires_at: string;
  refresh_expires_at: string | null;
  updated_at: string;
}

interface SignedStatePayload {
  workspace_id: string;
  user_id: string;
  return_to: string;
  web_origin: string;
  exp: number;
}

function deriveEncryptionKey(customKey?: string): Buffer {
  const raw =
    customKey ||
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    "default_secret_key_tripc_growth_os_32bytes!!";
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptTikTokToken(plaintext: string, customKey?: string): string {
  const key = deriveEncryptionKey(customKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptTikTokToken(cipherPayload: string, customKey?: string): string {
  const parts = cipherPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted TikTok token format");
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = deriveEncryptionKey(customKey);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function stateSigningSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.TIKTOK_CLIENT_SECRET ||
    "tripc_tiktok_oauth_state_dev_secret"
  );
}

export function sanitizeReturnPath(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "/distribution";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\") || /[\r\n]/.test(trimmed)) {
    return "/distribution";
  }
  return trimmed;
}

export function resolveSafeWebOrigin(candidateOrigin?: string | null): string {
  const { allowedOrigins } = getEnvironment();
  const configuredWebUrl = process.env.WEB_APP_URL?.trim();
  const safeOrigins = new Set<string>(allowedOrigins);
  if (configuredWebUrl) {
    try {
      const parsed = new URL(configuredWebUrl);
      if (["http:", "https:"].includes(parsed.protocol)) safeOrigins.add(parsed.origin);
    } catch {
      // Ignore malformed WEB_APP_URL
    }
  }
  if (candidateOrigin) {
    try {
      const parsed = new URL(candidateOrigin);
      if (safeOrigins.has(parsed.origin)) return parsed.origin;
    } catch {
      // Ignore malformed Origin header
    }
  }
  if (configuredWebUrl) {
    try {
      return new URL(configuredWebUrl).origin;
    } catch {
      // Fallback below
    }
  }
  return allowedOrigins[0] || "http://localhost:3000";
}

export function signOAuthState(input: {
  workspaceId: string;
  userId: string;
  returnTo?: string | null;
  webOrigin?: string | null;
  ttlMs?: number;
}): string {
  const payload: SignedStatePayload = {
    workspace_id: input.workspaceId,
    user_id: input.userId,
    return_to: sanitizeReturnPath(input.returnTo),
    web_origin: resolveSafeWebOrigin(input.webOrigin),
    exp: Date.now() + (input.ttlMs ?? OAUTH_STATE_TTL_MS),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", stateSigningSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(stateToken: string): SignedStatePayload {
  const dotIdx = stateToken.indexOf(".");
  if (dotIdx <= 0) {
    throw new AppError(400, "INVALID_OAUTH_STATE", "Invalid OAuth state parameter.");
  }
  const encoded = stateToken.slice(0, dotIdx);
  const sig = stateToken.slice(dotIdx + 1);
  const expectedSig = crypto.createHmac("sha256", stateSigningSecret()).update(encoded).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new AppError(400, "INVALID_OAUTH_STATE", "Invalid OAuth state signature.");
  }
  let parsed: SignedStatePayload;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SignedStatePayload;
  } catch {
    throw new AppError(400, "INVALID_OAUTH_STATE", "Malformed OAuth state payload.");
  }
  if (!parsed.workspace_id || !parsed.user_id || typeof parsed.exp !== "number") {
    throw new AppError(400, "INVALID_OAUTH_STATE", "Incomplete OAuth state payload.");
  }
  if (parsed.exp < Date.now()) {
    throw new AppError(400, "OAUTH_STATE_EXPIRED", "TikTok OAuth session expired. Please try connecting again.");
  }
  return {
    workspace_id: parsed.workspace_id,
    user_id: parsed.user_id,
    return_to: sanitizeReturnPath(parsed.return_to),
    web_origin: resolveSafeWebOrigin(parsed.web_origin),
    exp: parsed.exp,
  };
}

export function getTikTokAppConfig(): {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  privacyDefault: TikTokPrivacyLevel;
  apiBaseUrl: string;
} {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim() || "";
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim() || "";
  const redirectUri = process.env.TIKTOK_REDIRECT_URI?.trim() || "";
  if (!clientKey || !clientSecret || !redirectUri) {
    throw new AppError(
      503,
      "TIKTOK_NOT_CONFIGURED",
      "TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and TIKTOK_REDIRECT_URI must be configured on the API server.",
    );
  }
  const scopesRaw = process.env.TIKTOK_OAUTH_SCOPES?.trim() || "user.info.basic,video.upload,video.publish";
  const scopes = scopesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const envPrivacy = process.env.TIKTOK_PRIVACY_LEVEL?.trim() || "SELF_ONLY";
  const privacyDefault = VALID_PRIVACY_LEVELS.includes(envPrivacy as TikTokPrivacyLevel)
    ? (envPrivacy as TikTokPrivacyLevel)
    : "SELF_ONLY";
  const apiBaseUrl = (process.env.TIKTOK_API_BASE_URL?.trim() || "https://open.tiktokapis.com").replace(/\/+$/, "");
  return { clientKey, clientSecret, redirectUri, scopes, privacyDefault, apiBaseUrl };
}

export function buildTikTokAuthorizeUrl(input: {
  workspaceId: string;
  userId: string;
  returnTo?: string | null;
  webOrigin?: string | null;
}): { url: string; state: string; redirect_uri: string; scopes: string[] } {
  const cfg = getTikTokAppConfig();
  const state = signOAuthState(input);
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", cfg.clientKey);
  url.searchParams.set("scope", cfg.scopes.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("state", state);
  return {
    url: url.toString(),
    state,
    redirect_uri: cfg.redirectUri,
    scopes: cfg.scopes,
  };
}

export interface TikTokTokenExchangeResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  refresh_expires_in?: number;
  open_id: string;
  scopes: string[];
}

export async function exchangeTikTokCode(code: string, fetchFn: typeof fetch = fetch): Promise<TikTokTokenExchangeResponse> {
  const cfg = getTikTokAppConfig();
  const body = new URLSearchParams({
    client_key: cfg.clientKey,
    client_secret: cfg.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: cfg.redirectUri,
  });

  const res = await fetchFn(`${cfg.apiBaseUrl}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });

  const payload = (await res.json().catch(() => ({}))) as Record<string, any>;
  // Support both live flat TikTok format and nested { data: {...} } mocks
  const tokenData = (payload?.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, any>;
  const errCode = payload?.error?.code || (typeof payload?.error === "string" ? payload.error : undefined);
  const errDesc = payload?.error?.message || payload?.error_description || payload?.message;

  if (!res.ok || (errCode && errCode !== "ok") || typeof tokenData?.access_token !== "string" || !tokenData.open_id) {
    throw new AppError(
      502,
      "TIKTOK_OAUTH_EXCHANGE_FAILED",
      typeof errDesc === "string" && errDesc
        ? `TikTok token exchange failed: ${errDesc}`
        : `TikTok token exchange failed (HTTP ${res.status})`,
    );
  }

  const scopeStr = typeof tokenData.scope === "string" ? tokenData.scope : "";
  const scopes = scopeStr
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    access_token: tokenData.access_token,
    refresh_token: typeof tokenData.refresh_token === "string" ? tokenData.refresh_token : undefined,
    expires_in: Number(tokenData.expires_in) > 0 ? Number(tokenData.expires_in) : 86400,
    refresh_expires_in: Number(tokenData.refresh_expires_in) > 0 ? Number(tokenData.refresh_expires_in) : undefined,
    open_id: String(tokenData.open_id),
    scopes: scopes.length > 0 ? scopes : cfg.scopes,
  };
}

export async function fetchTikTokUserInfo(
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ open_id?: string; display_name?: string; avatar_url?: string }> {
  const apiBaseUrl = (process.env.TIKTOK_API_BASE_URL?.trim() || "https://open.tiktokapis.com").replace(/\/+$/, "");
  try {
    const res = await fetchFn(
      `${apiBaseUrl}/v2/user/info/?fields=open_id,union_id,avatar_url,display_name`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return {};
    const payload = (await res.json().catch(() => ({}))) as Record<string, any>;
    const userObj = payload?.data?.user;
    if (!userObj || typeof userObj !== "object") return {};
    return {
      open_id: typeof userObj.open_id === "string" ? userObj.open_id : undefined,
      display_name: typeof userObj.display_name === "string" ? userObj.display_name : undefined,
      avatar_url: typeof userObj.avatar_url === "string" ? userObj.avatar_url : undefined,
    };
  } catch {
    return {};
  }
}

export async function saveTikTokOAuthConnection(input: {
  workspaceId: string;
  actorUserId: string;
  tokens: TikTokTokenExchangeResponse;
  profile?: { display_name?: string; avatar_url?: string };
}): Promise<TikTokConnectionSummary> {
  const encryptedAccess = encryptTikTokToken(input.tokens.access_token);
  const encryptedRefresh = input.tokens.refresh_token ? encryptTikTokToken(input.tokens.refresh_token) : null;
  const expiresAt = new Date(Date.now() + input.tokens.expires_in * 1000).toISOString();
  const refreshExpiresAt = input.tokens.refresh_expires_in
    ? new Date(Date.now() + input.tokens.refresh_expires_in * 1000).toISOString()
    : null;
  const displayName = input.profile?.display_name?.trim() || `TikTok (${input.tokens.open_id.slice(0, 12)})`;
  const avatarUrl = input.profile?.avatar_url?.trim() || null;

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO tiktok_oauth_tokens
         (workspace_id, open_id, display_name, avatar_url, encrypted_access_token, encrypted_refresh_token,
          scopes, expires_at, refresh_expires_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (workspace_id)
       DO UPDATE SET
         open_id = EXCLUDED.open_id,
         display_name = EXCLUDED.display_name,
         avatar_url = EXCLUDED.avatar_url,
         encrypted_access_token = EXCLUDED.encrypted_access_token,
         encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
         scopes = EXCLUDED.scopes,
         expires_at = EXCLUDED.expires_at,
         refresh_expires_at = EXCLUDED.refresh_expires_at,
         updated_at = NOW()`,
      [
        input.workspaceId,
        input.tokens.open_id,
        displayName,
        avatarUrl,
        encryptedAccess,
        encryptedRefresh,
        input.tokens.scopes,
        expiresAt,
        refreshExpiresAt,
      ],
    );

    // Keep single active TikTok connection row per workspace
    await client.query(
      `DELETE FROM integration_connections
       WHERE workspace_id = $1 AND provider = 'tiktok' AND (account_ref IS DISTINCT FROM $2)`,
      [input.workspaceId, input.tokens.open_id],
    );

    await client.query(
      `INSERT INTO integration_connections
         (workspace_id, provider, account_ref, display_name, status, scopes, credential_ref, last_error, verified_at, updated_at)
       VALUES ($1, 'tiktok', $2, $3, 'connected', $4, 'tiktok_oauth_tokens', NULL, NOW(), NOW())
       ON CONFLICT (workspace_id, provider, account_ref)
       DO UPDATE SET
         display_name = EXCLUDED.display_name,
         status = 'connected',
         scopes = EXCLUDED.scopes,
         credential_ref = EXCLUDED.credential_ref,
         last_error = NULL,
         verified_at = NOW(),
         updated_at = NOW()`,
      [input.workspaceId, input.tokens.open_id, displayName, input.tokens.scopes],
    );

    await client.query(
      `INSERT INTO audit_events (workspace_id, actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'integration.tiktok.connected', 'integration', $1, $3)`,
      [
        input.workspaceId,
        input.actorUserId,
        JSON.stringify({
          open_id: input.tokens.open_id,
          display_name: displayName,
          scopes: input.tokens.scopes,
        }),
      ],
    );
  });

  const privacyDefault = validatePrivacyLevel(process.env.TIKTOK_PRIVACY_LEVEL || "SELF_ONLY");
  return {
    connected: true,
    expired: false,
    open_id: input.tokens.open_id,
    display_name: displayName,
    avatar_url: avatarUrl,
    scopes: input.tokens.scopes,
    expires_at: expiresAt,
    refresh_expires_at: refreshExpiresAt,
    sandbox_privacy_default: privacyDefault,
  };
}

export async function getTikTokConnectionSummary(workspaceId: string): Promise<TikTokConnectionSummary> {
  const privacyDefault = validatePrivacyLevel(process.env.TIKTOK_PRIVACY_LEVEL || "SELF_ONLY");
  const res = await query<TikTokTokenDbRow>(
    `SELECT id, workspace_id, open_id, display_name, avatar_url, encrypted_access_token,
            encrypted_refresh_token, scopes, expires_at, refresh_expires_at, updated_at
     FROM tiktok_oauth_tokens
     WHERE workspace_id = $1
     ORDER BY updated_at DESC LIMIT 1`,
    [workspaceId],
  );
  const row = res.rows[0];
  if (!row) {
    if ((process.env.INTEGRATION_MODE ?? "fake") === "production" && process.env.TIKTOK_ACCESS_TOKEN?.trim()) {
      return {
        connected: true,
        expired: false,
        open_id: process.env.TIKTOK_OPEN_ID?.trim() || "env_tiktok_creator",
        display_name: "TikTok Env Token",
        avatar_url: null,
        scopes: ["user.info.basic", "video.upload", "video.publish"],
        expires_at: null,
        refresh_expires_at: null,
        sandbox_privacy_default: privacyDefault,
      };
    }
    return {
      connected: false,
      expired: false,
      open_id: null,
      display_name: null,
      avatar_url: null,
      scopes: [],
      expires_at: null,
      refresh_expires_at: null,
      sandbox_privacy_default: privacyDefault,
    };
  }

  const now = Date.now();
  const accessValid = new Date(row.expires_at).getTime() > now;
  const hasRefresh = Boolean(
    row.encrypted_refresh_token &&
      (!row.refresh_expires_at || new Date(row.refresh_expires_at).getTime() > now),
  );
  const usable = accessValid || hasRefresh;

  return {
    connected: usable,
    expired: !usable,
    open_id: row.open_id,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    scopes: row.scopes ?? [],
    expires_at: row.expires_at,
    refresh_expires_at: row.refresh_expires_at,
    sandbox_privacy_default: privacyDefault,
  };
}

export async function disconnectTikTok(userId: string, workspaceId: string): Promise<{ disconnected: true }> {
  const existing = await query<{ encrypted_access_token: string; open_id: string }>(
    `SELECT encrypted_access_token, open_id FROM tiktok_oauth_tokens WHERE workspace_id = $1 LIMIT 1`,
    [workspaceId],
  );

  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  const apiBaseUrl = (process.env.TIKTOK_API_BASE_URL?.trim() || "https://open.tiktokapis.com").replace(/\/+$/, "");

  if (existing.rows[0]?.encrypted_access_token && clientKey && clientSecret) {
    try {
      const accessToken = decryptTikTokToken(existing.rows[0].encrypted_access_token);
      await fetch(`${apiBaseUrl}/v2/oauth/revoke/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          token: accessToken,
        }).toString(),
        signal: AbortSignal.timeout(5000),
      }).catch(() => undefined);
    } catch {
      // Non-fatal: still clear local tokens cleanly
    }
  }

  await withTransaction(async (client) => {
    await client.query(`DELETE FROM tiktok_oauth_tokens WHERE workspace_id = $1`, [workspaceId]);
    await client.query(
      `UPDATE integration_connections
       SET status = 'revoked', verified_at = NULL, credential_ref = NULL, updated_at = NOW()
       WHERE workspace_id = $1 AND provider = 'tiktok'`,
      [workspaceId],
    );
    await client.query(
      `INSERT INTO audit_events (workspace_id, actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'integration.tiktok.disconnected', 'integration', $1, $3)`,
      [
        workspaceId,
        userId,
        JSON.stringify({ open_id: existing.rows[0]?.open_id ?? null }),
      ],
    );
  });

  return { disconnected: true };
}

export function validatePrivacyLevel(level?: string | null): TikTokPrivacyLevel {
  if (level && VALID_PRIVACY_LEVELS.includes(level as TikTokPrivacyLevel)) {
    return level as TikTokPrivacyLevel;
  }
  return "SELF_ONLY";
}

export function resolveTikTokUploadRoot(): string {
  const explicit = process.env.TIKTOK_UPLOAD_DIR?.trim();
  if (explicit) return path.resolve(explicit);

  const probeRoots = [process.cwd(), __dirname];
  for (const start of probeRoots) {
    let cur = start;
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(cur, "apps")) && fs.existsSync(path.join(cur, "database"))) {
        return path.join(cur, ".tiktok-uploads");
      }
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  }
  return path.resolve(process.cwd(), "../../.tiktok-uploads");
}

export function validateMp4Buffer(buffer: Buffer, fileName?: string): void {
  if (!buffer || buffer.length === 0) {
    throw new AppError(422, "EMPTY_VIDEO_FILE", "File video bị rỗng.");
  }
  if (buffer.length > MAX_VIDEO_BYTES) {
    throw new AppError(413, "VIDEO_TOO_LARGE", "Video vượt quá giới hạn 100 MB.");
  }
  if (fileName) {
    const ext = path.extname(fileName).toLowerCase();
    if (ext !== ".mp4" && ext !== ".mov") {
      throw new AppError(422, "UNSUPPORTED_VIDEO_FORMAT", "Chỉ hỗ trợ file video .mp4 hoặc .mov.");
    }
  }
  // ISO Base Media File Format header: box size (4 bytes) + 'ftyp' (bytes 4..7)
  if (buffer.length < 16 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new AppError(
      422,
      "INVALID_MP4_HEADER",
      "File không đúng định dạng container MP4/MOV hợp lệ (thiếu header ftyp).",
    );
  }
}

export function validatePublicVideoUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new AppError(422, "INVALID_MEDIA_URL", "URL video không đúng định dạng.");
  }
  if (parsed.protocol !== "https:") {
    throw new AppError(422, "INVALID_MEDIA_URL", "URL video TikTok phải bắt đầu bằng https:// công khai.");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith(".local")
  ) {
    throw new AppError(422, "PRIVATE_MEDIA_URL", "URL video không được trỏ tới localhost hoặc mạng nội bộ.");
  }
  return parsed.toString();
}

export function normalizeHashtags(raw?: string | string[] | null): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : raw.split(/[\s,;]+/);
  const cleaned = parts
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .map((tag) => `#${tag.slice(1).replace(/[^\p{L}\p{N}_]/gu, "")}`)
    .filter((tag) => tag.length > 1);
  return [...new Set(cleaned)].slice(0, 15);
}

export function buildTikTokCaptionFromArtifact(artifact: {
  title: string;
  payload: Record<string, unknown>;
}): { title: string; caption: string; hashtags: string[] } {
  const result = (
    artifact.payload?.result && typeof artifact.payload.result === "object"
      ? artifact.payload.result
      : {}
  ) as Record<string, unknown>;
  const tiktok = (result.tiktok && typeof result.tiktok === "object" ? result.tiktok : null) as
    | { hook?: unknown; scenes?: Array<{ voiceover?: unknown }>; cta?: unknown; hashtags?: unknown }
    | null;
  const facebook = (result.facebook && typeof result.facebook === "object" ? result.facebook : null) as
    | { text?: unknown }
    | null;

  const title =
    (typeof result.title === "string" && result.title.trim()) || artifact.title || "TripC Da Nang Short";

  if (tiktok && typeof tiktok.hook === "string" && tiktok.hook.trim()) {
    const firstScene =
      Array.isArray(tiktok.scenes) && typeof tiktok.scenes[0]?.voiceover === "string"
        ? tiktok.scenes[0].voiceover.trim()
        : "";
    const cta = typeof tiktok.cta === "string" ? tiktok.cta.trim() : "";
    const rawTags = Array.isArray(tiktok.hashtags)
      ? tiktok.hashtags.map(String)
      : ["#TripC", "#DaNang", "#VietnamTravel"];
    const hashtags = normalizeHashtags(rawTags);
    const caption = [tiktok.hook.trim(), firstScene, cta, hashtags.join(" ")]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 2200);
    return { title, caption, hashtags };
  }

  const fbText = typeof facebook?.text === "string" ? facebook.text.trim() : "";
  const summary = typeof result.meta_description === "string" ? result.meta_description.trim() : "";
  const body =
    fbText ||
    (summary ? `${title}\n\n${summary}` : `${title}\n\nKhám phá ngay cùng TripC!`);
  const hashtags = ["#TripC", "#DaNang", "#VietnamTravel"];
  const hasTag = /#\p{L}/u.test(body);
  const caption = (hasTag ? body : `${body}\n\n${hashtags.join(" ")}`).slice(0, 2200);
  return { title, caption, hashtags };
}

export async function listTikTokVideos(workspaceId: string): Promise<TikTokVideoRow[]> {
  const res = await query<TikTokVideoRow>(
    `SELECT tv.id, tv.workspace_id, tv.title, tv.caption, tv.hashtags, tv.source_artifact_id,
            tv.video_source_type, tv.file_size_bytes, tv.media_url, tv.privacy_level, tv.is_aigc,
            tv.status, tv.artifact_id, tv.publishing_job_id, tv.tiktok_publish_id, tv.error_message,
            tv.created_by, tv.created_at, tv.updated_at,
            pj.status AS job_status, pj.scheduled_for AS job_scheduled_for,
            pj.published_at AS job_published_at, pj.external_post_id AS job_external_post_id,
            pj.error_message AS job_error_message
     FROM tiktok_videos tv
     LEFT JOIN publishing_jobs pj ON pj.id = tv.publishing_job_id AND pj.workspace_id = tv.workspace_id
     WHERE tv.workspace_id = $1
     ORDER BY tv.created_at DESC
     LIMIT 50`,
    [workspaceId],
  );
  return res.rows;
}

export async function createOptionBTikTokVideo(input: {
  workspaceId: string;
  actorUserId: string;
  actorRole: Role;
  title?: string | null;
  caption?: string | null;
  hashtags?: string[];
  sourceArtifactId?: string | null;
  videoSourceType: "file_upload" | "url";
  fileBuffer?: Buffer;
  fileName?: string;
  mediaUrl?: string | null;
  privacyLevel?: string | null;
  isAigc?: boolean;
  action: "publish_now" | "schedule" | "save_draft";
  scheduledFor?: string | null;
}): Promise<{ video: TikTokVideoRow; job_id: string | null }> {
  const connection = await getTikTokConnectionSummary(input.workspaceId);
  if (input.action !== "save_draft" && !connection.connected) {
    throw new AppError(
      409,
      "TIKTOK_ACCOUNT_NOT_CONNECTED",
      "Chưa kết nối tài khoản TikTok cho workspace này. Hãy bấm 'Kết nối TikTok' trước khi đăng hoặc hẹn giờ.",
    );
  }

  let validatedMediaUrl: string | null = null;
  let savedFilePath: string | null = null;
  let fileSizeBytes: number | null = null;

  if (input.videoSourceType === "file_upload") {
    if (!input.fileBuffer) {
      throw new AppError(422, "VIDEO_FILE_REQUIRED", "Vui lòng chọn file video .mp4 để tải lên.");
    }
    validateMp4Buffer(input.fileBuffer, input.fileName);
    fileSizeBytes = input.fileBuffer.length;
  } else {
    if (!input.mediaUrl) {
      throw new AppError(422, "MEDIA_URL_REQUIRED", "Vui lòng nhập URL video https:// công khai.");
    }
    validatedMediaUrl = validatePublicVideoUrl(input.mediaUrl);
  }

  let sourceArtifact: { id: string; title: string; payload: Record<string, unknown> } | null = null;
  if (input.sourceArtifactId) {
    const srcRes = await query<{ id: string; title: string; payload: Record<string, unknown> }>(
      `SELECT id, title, payload FROM content_artifacts WHERE workspace_id = $1 AND id = $2`,
      [input.workspaceId, input.sourceArtifactId],
    );
    sourceArtifact = srcRes.rows[0] ?? null;
    if (!sourceArtifact) {
      throw new AppError(422, "INVALID_ARTIFACT_REF", "Bài viết / topic nguồn không thuộc workspace này.");
    }
  }

  const autoCaption = sourceArtifact ? buildTikTokCaptionFromArtifact(sourceArtifact) : null;
  const cleanTitle = (input.title?.trim() || autoCaption?.title || "TripC TikTok Video").slice(0, 255);
  const hashtags = normalizeHashtags(
    input.hashtags && input.hashtags.length > 0 ? input.hashtags : autoCaption?.hashtags,
  );
  let cleanCaption = (input.caption?.trim() || autoCaption?.caption || cleanTitle).trim();
  for (const tag of hashtags) {
    if (!cleanCaption.toLowerCase().includes(tag.toLowerCase())) {
      cleanCaption = `${cleanCaption} ${tag}`.trim();
    }
  }
  cleanCaption = cleanCaption.slice(0, 2200);
  if (!cleanCaption) {
    throw new AppError(422, "CAPTION_REQUIRED", "Caption TikTok không được để trống.");
  }

  let scheduledIso = new Date().toISOString();
  if (input.action === "schedule") {
    if (!input.scheduledFor) {
      throw new AppError(422, "SCHEDULE_TIME_REQUIRED", "Vui lòng chọn ngày giờ hẹn đăng.");
    }
    const parsedDate = new Date(input.scheduledFor);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new AppError(422, "INVALID_SCHEDULE_TIME", "Thời gian hẹn đăng không hợp lệ.");
    }
    scheduledIso = parsedDate.toISOString();
  }

  // TikTok Sandbox accepts SELF_ONLY during testing; honor env default when omitted
  const privacyLevel = validatePrivacyLevel(input.privacyLevel || connection.sandbox_privacy_default);
  const isAigc = input.isAigc !== false;

  if (input.videoSourceType === "file_upload" && input.fileBuffer) {
    const uploadDir = path.join(resolveTikTokUploadRoot(), input.workspaceId);
    fs.mkdirSync(uploadDir, { recursive: true });
    const safeExt = input.fileName && path.extname(input.fileName).toLowerCase() === ".mov" ? ".mov" : ".mp4";
    const fileId = crypto.randomUUID();
    savedFilePath = path.join(uploadDir, `${fileId}${safeExt}`);
    fs.writeFileSync(savedFilePath, input.fileBuffer);
  }

  try {
    return await withTransaction(async (client) => {
      let artifactId: string | null = null;
      let jobId: string | null = null;

      if (input.action !== "save_draft") {
        // Construct result & evidence with ZERO undefined keys so API canonicalJson and
        // worker gateway_recheck compute identical SHA-256 hashes.
        const artifactResult: Record<string, unknown> = {
          title: cleanTitle,
          caption: cleanCaption,
          hashtags,
          media_type: "video",
          video_source_type: input.videoSourceType,
          privacy_level: privacyLevel,
          is_aigc: isAigc,
        };
        if (input.sourceArtifactId) artifactResult.source_artifact_id = input.sourceArtifactId;
        if (validatedMediaUrl) artifactResult.media_url = validatedMediaUrl;
        if (savedFilePath) artifactResult.video_filename = path.basename(savedFilePath);

        const artifactEvidence: Array<Record<string, unknown>> = input.sourceArtifactId
          ? [{ type: "source_artifact", artifact_id: input.sourceArtifactId }]
          : [];

        const contentHash = sha256Hex(
          canonicalJson({ result: artifactResult, evidence: artifactEvidence }),
        );

        const artifactPayload: Record<string, unknown> = {
          result: artifactResult,
          document_markdown: cleanCaption,
          media_type: "video",
          is_ai_generated: isAigc,
        };
        if (validatedMediaUrl) artifactPayload.media_url = validatedMediaUrl;

        const artRes = await client.query<{ id: string }>(
          `INSERT INTO content_artifacts
             (workspace_id, task_id, version, content_hash, role, operation, artifact_type, title, storage, payload, evidence)
           VALUES ($1, NULL, 1, $2, 'content', 'tiktok.video_upload', 'tiktok_video', $3, 'postgres_ledger', $4, $5)
           RETURNING id`,
          [
            input.workspaceId,
            contentHash,
            cleanTitle,
            JSON.stringify(artifactPayload),
            JSON.stringify(artifactEvidence),
          ],
        );
        artifactId = artRes.rows[0].id;

        const approverRole = input.actorRole === "owner" || input.actorRole === "editor" ? input.actorRole : "editor";
        const appRes = await client.query<{ id: string }>(
          `INSERT INTO approvals
             (workspace_id, target_type, target_id, target_version, target_hash, status, decision, actor_id, actor_role, review_note)
           VALUES ($1, 'artifact', $2, 1, $3, 'approved', 'approve', $4, $5, 'Approved via TikTok Option B upload')
           RETURNING id`,
          [input.workspaceId, artifactId, contentHash, input.actorUserId, approverRole],
        );
        const approvalId = appRes.rows[0].id;

        const contentRes = await client.query<{ id: string }>(
          `INSERT INTO contents
             (workspace_id, title, body_markdown, type, status, created_by, approved_by, current_version, content_hash, artifact_id)
           VALUES ($1, $2, $3, 'tiktok_video', 'approved', 'human', $4, 1, $5, $6)
           RETURNING id`,
          [input.workspaceId, cleanTitle, cleanCaption, input.actorUserId, contentHash, artifactId],
        );
        const contentId = contentRes.rows[0].id;

        const channelRes = await client.query<{ id: string }>(
          `SELECT id FROM channels WHERE workspace_id = $1 AND platform_name = 'tiktok' ORDER BY created_at ASC LIMIT 1`,
          [input.workspaceId],
        );
        let channelId = channelRes.rows[0]?.id;
        if (!channelId) {
          const chDisplay = connection.display_name ? `TikTok (${connection.display_name})` : "TripC TikTok";
          const chInsert = await client.query<{ id: string }>(
            `INSERT INTO channels (workspace_id, platform_name, display_name, channel_identifier)
             VALUES ($1, 'tiktok', $2, $3) RETURNING id`,
            [input.workspaceId, chDisplay, connection.open_id ?? null],
          );
          channelId = chInsert.rows[0].id;
        }

        const vidInsert = await client.query<{ id: string }>(
          `INSERT INTO tiktok_videos
             (workspace_id, title, caption, hashtags, source_artifact_id, video_source_type, file_path,
              file_size_bytes, media_url, privacy_level, is_aigc, status, artifact_id, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'scheduled', $12, $13)
           RETURNING id`,
          [
            input.workspaceId,
            cleanTitle,
            cleanCaption,
            hashtags,
            input.sourceArtifactId ?? null,
            input.videoSourceType,
            savedFilePath,
            fileSizeBytes,
            validatedMediaUrl,
            privacyLevel,
            isAigc,
            artifactId,
            input.actorUserId,
          ],
        );
        const tiktokVideoId = vidInsert.rows[0].id;

        const jobInsert = await client.query<{ id: string }>(
          `INSERT INTO publishing_jobs
             (content_id, channel_id, scheduled_for, status, workspace_id, artifact_id, approval_id,
              mode, created_by, media_url, media_path, media_type, custom_caption, tiktok_video_id)
           VALUES ($1, $2, $3, 'scheduled', $4, $5, $6, 'live', $7, $8, $9, 'video', $10, $11)
           RETURNING id`,
          [
            contentId,
            channelId,
            scheduledIso,
            input.workspaceId,
            artifactId,
            approvalId,
            input.actorUserId,
            validatedMediaUrl,
            savedFilePath,
            cleanCaption,
            tiktokVideoId,
          ],
        );
        jobId = jobInsert.rows[0].id;

        await client.query(`UPDATE tiktok_videos SET publishing_job_id = $1 WHERE id = $2`, [
          jobId,
          tiktokVideoId,
        ]);

        await client.query(
          `INSERT INTO outbox_events (workspace_id, event_type, dedup_key, payload)
           VALUES ($1, 'publishing.scheduled', $2, $3)
           ON CONFLICT (workspace_id, dedup_key) DO NOTHING`,
          [
            input.workspaceId,
            `publish:${jobId}`,
            JSON.stringify({
              job_id: jobId,
              artifact_id: artifactId,
              approval_id: approvalId,
              channel_id: channelId,
              mode: "live",
              tiktok_video_id: tiktokVideoId,
            }),
          ],
        );

        await client.query(
          `INSERT INTO audit_events (workspace_id, actor_id, action, entity_type, entity_id, details)
           VALUES ($1, $2, 'tiktok.video_scheduled', 'publishing_job', $3, $4)`,
          [
            input.workspaceId,
            input.actorUserId,
            jobId,
            JSON.stringify({
              tiktok_video_id: tiktokVideoId,
              video_source_type: input.videoSourceType,
              scheduled_for: scheduledIso,
              privacy_level: privacyLevel,
            }),
          ],
        );

        const finalRow = await client.query<TikTokVideoRow>(
          `SELECT id, workspace_id, title, caption, hashtags, source_artifact_id, video_source_type,
                  file_size_bytes, media_url, privacy_level, is_aigc, status, artifact_id,
                  publishing_job_id, tiktok_publish_id, error_message, created_by, created_at, updated_at
           FROM tiktok_videos WHERE id = $1`,
          [tiktokVideoId],
        );
        return { video: finalRow.rows[0], job_id: jobId };
      }

      // save_draft path
      const draftInsert = await client.query<TikTokVideoRow>(
        `INSERT INTO tiktok_videos
           (workspace_id, title, caption, hashtags, source_artifact_id, video_source_type, file_path,
            file_size_bytes, media_url, privacy_level, is_aigc, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ready', $12)
         RETURNING id, workspace_id, title, caption, hashtags, source_artifact_id, video_source_type,
                   file_size_bytes, media_url, privacy_level, is_aigc, status, artifact_id,
                   publishing_job_id, tiktok_publish_id, error_message, created_by, created_at, updated_at`,
        [
          input.workspaceId,
          cleanTitle,
          cleanCaption,
          hashtags,
          input.sourceArtifactId ?? null,
          input.videoSourceType,
          savedFilePath,
          fileSizeBytes,
          validatedMediaUrl,
          privacyLevel,
          isAigc,
          input.actorUserId,
        ],
      );
      return { video: draftInsert.rows[0], job_id: null };
    });
  } catch (err) {
    if (savedFilePath && fs.existsSync(savedFilePath)) {
      try {
        fs.unlinkSync(savedFilePath);
      } catch {
        // Ignore cleanup failure
      }
    }
    throw err;
  }
}
