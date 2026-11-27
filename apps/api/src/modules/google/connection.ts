/**
 * Google account of a workspace, connected by its owner through Google's OAuth consent screen.
 *
 * Owner clicks "Kết nối Google" → /integrations/google/auth-url → Google consent → /v1/integrations/google/callback
 * exchanges the code, keeps only the refresh token (sealed with TOKEN_ENCRYPTION_KEY) and the account email.
 * Drive (Agent 2) and Business Profile (Agent 5) then use `workspaceGoogleAuth`, which prefers this token and
 * falls back to the server-wide GOOGLE_OAUTH_REFRESH_TOKEN / GOOGLE_API_KEY that existed before.
 */
import type { Pool } from "pg";
import { AppError } from "../../lib/errors";
import { openSecret, sealSecret } from "../../lib/secretBox";
import type { FetchLike } from "../ai/providers";
import { signOAuthState } from "../integrations/tiktok";
import { GoogleApiError, createGoogleAuth, googleOAuthConfigured, type GoogleAuth } from "./oauth";

type Db = Pick<Pool, "query">;

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/business.manage",
];

export interface GoogleConnectionStatus {
  configured: boolean;
  connected: boolean;
  source: "workspace" | "server" | "api_key" | "none";
  email: string | null;
  scopes: string[];
  connected_at: string | null;
  redirect_uri: string | null;
  last_error: string | null;
}

/** OAuth client of the API server (Google Cloud Console → Credentials → OAuth client, type "Web application"). */
export function googleOAuthClient(): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

function requireClient() {
  const client = googleOAuthClient();
  if (!client) {
    throw new AppError(
      503,
      "GOOGLE_NOT_CONFIGURED",
      "Máy chủ chưa có GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET và GOOGLE_OAUTH_REDIRECT_URI.",
    );
  }
  return client;
}

export function buildGoogleAuthorizeUrl(input: { workspaceId: string; userId: string; returnTo?: string | null; webOrigin?: string | null }) {
  const client = requireClient();
  const state = signOAuthState({ workspaceId: input.workspaceId, userId: input.userId, returnTo: input.returnTo ?? "/gmaps?tab=drive_assets", webOrigin: input.webOrigin });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", client.clientId);
  url.searchParams.set("redirect_uri", client.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  // offline + consent: Google returns a refresh token every time, so a reconnect always repairs the link.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return { url: url.toString(), redirect_uri: client.redirectUri, scopes: GOOGLE_SCOPES };
}

export async function exchangeGoogleCode(code: string, fetchImpl: FetchLike = (u, i) => fetch(u, i)) {
  const client = requireClient();
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: client.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new GoogleApiError(res.status, `Google từ chối mã xác thực (HTTP ${res.status})`, text.slice(0, 300));
  const json = JSON.parse(text) as { access_token?: string; refresh_token?: string; scope?: string; id_token?: string };
  if (!json.refresh_token) {
    throw new AppError(400, "GOOGLE_NO_REFRESH_TOKEN", "Google không trả refresh token. Hãy gỡ quyền ứng dụng trong tài khoản Google rồi kết nối lại.");
  }
  return { accessToken: json.access_token ?? "", refreshToken: json.refresh_token, scopes: (json.scope ?? "").split(" ").filter(Boolean), idToken: json.id_token };
}

/** Email and subject from the id_token Google just issued to us over TLS (no signature check needed here). */
export function readIdToken(idToken?: string): { email: string | null; sub: string | null } {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken).split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string; sub?: string };
    return { email: payload.email ?? null, sub: payload.sub ?? null };
  } catch {
    return { email: null, sub: null };
  }
}

export async function saveGoogleConnection(
  db: Db,
  input: { workspaceId: string; userId: string; refreshToken: string; scopes: string[]; email: string | null; subject: string | null },
) {
  await db.query(
    `INSERT INTO google_oauth_connections (workspace_id, google_email, google_subject, scopes, refresh_token_enc, connected_by, connected_at, updated_at, last_error)
     VALUES ($1::uuid, $2, $3, $4::text[], $5, $6::uuid, NOW(), NOW(), NULL)
     ON CONFLICT (workspace_id) DO UPDATE SET
       google_email = EXCLUDED.google_email, google_subject = EXCLUDED.google_subject, scopes = EXCLUDED.scopes,
       refresh_token_enc = EXCLUDED.refresh_token_enc, connected_by = EXCLUDED.connected_by,
       connected_at = NOW(), updated_at = NOW(), last_error = NULL`,
    [input.workspaceId, input.email, input.subject, input.scopes, sealSecret(input.refreshToken), input.userId],
  );
}

/** Forgets the token here and asks Google to revoke it, so the consent disappears from the account too. */
export async function disconnectGoogle(db: Db, workspaceId: string, fetchImpl: FetchLike = (u, i) => fetch(u, i)) {
  const row = (await db.query(`DELETE FROM google_oauth_connections WHERE workspace_id = $1::uuid RETURNING refresh_token_enc`, [workspaceId])).rows[0];
  const token = row ? openSecret(row.refresh_token_enc) : undefined;
  if (token) {
    await fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
  }
  return { disconnected: Boolean(row) };
}

async function loadConnection(db: Db, workspaceId: string) {
  try {
    return (
      await db.query(
        `SELECT google_email, scopes, refresh_token_enc, connected_at, last_error FROM google_oauth_connections WHERE workspace_id = $1::uuid`,
        [workspaceId],
      )
    ).rows[0] as { google_email: string | null; scopes: string[]; refresh_token_enc: string; connected_at: Date; last_error: string | null } | undefined;
  } catch {
    return undefined; // table not migrated yet: behave as before (server-wide credentials only)
  }
}

export async function googleConnectionStatus(db: Db, workspaceId: string): Promise<GoogleConnectionStatus> {
  const client = googleOAuthClient();
  const row = await loadConnection(db, workspaceId);
  const base = {
    configured: Boolean(client),
    // Shown before the client exists too: it is the exact value to register in Google Cloud Console.
    redirect_uri: client?.redirectUri ?? (process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || null),
    last_error: row?.last_error ?? null,
  };
  if (row) {
    return { ...base, connected: true, source: "workspace", email: row.google_email, scopes: row.scopes ?? [], connected_at: new Date(row.connected_at).toISOString() };
  }
  if (googleOAuthConfigured()) return { ...base, connected: true, source: "server", email: null, scopes: [], connected_at: null };
  if (process.env.GOOGLE_API_KEY?.trim()) return { ...base, connected: false, source: "api_key", email: null, scopes: [], connected_at: null };
  return { ...base, connected: false, source: "none", email: null, scopes: [], connected_at: null };
}

/** True when this workspace can call Google APIs with a user token (its own or the server's). */
export async function googleUserTokenAvailable(db: Db, workspaceId: string): Promise<boolean> {
  return Boolean(await loadConnection(db, workspaceId)) || googleOAuthConfigured();
}

const cache = new Map<string, { at: number; auth: GoogleAuth }>();

/** GoogleAuth for one workspace: its own connected account first, else the server-wide credentials. */
export async function workspaceGoogleAuth(db: Db, workspaceId: string, fetchImpl?: FetchLike): Promise<GoogleAuth> {
  const row = await loadConnection(db, workspaceId);
  const client = googleOAuthClient() ?? (process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET
    ? { clientId: process.env.GOOGLE_OAUTH_CLIENT_ID.trim(), clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET.trim(), redirectUri: "" }
    : null);
  const refreshToken = row ? openSecret(row.refresh_token_enc) : undefined;
  if (!refreshToken || !client) return createGoogleAuth(fetchImpl);
  const key = `${workspaceId}:${row?.connected_at ? new Date(row.connected_at).getTime() : 0}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 50 * 60_000) return hit.auth; // keeps the access token cached between calls
  const auth = createGoogleAuth(fetchImpl, Date.now, { clientId: client.clientId, clientSecret: client.clientSecret, refreshToken });
  const wrapped: GoogleAuth = {
    apiKey: auth.apiKey,
    async accessToken() {
      try {
        return await auth.accessToken();
      } catch (error) {
        // invalid_grant: the owner removed access in their Google account. Say so on the page.
        const message = error instanceof GoogleApiError && /invalid_grant/.test(String(error.body)) ? "Google đã thu hồi quyền; hãy bấm Kết nối Google lại." : (error as Error).message;
        await db.query(`UPDATE google_oauth_connections SET last_error = $2, updated_at = NOW() WHERE workspace_id = $1::uuid`, [workspaceId, message.slice(0, 300)]).catch(() => undefined);
        throw error;
      }
    },
  };
  cache.set(key, { at: Date.now(), auth: wrapped });
  return wrapped;
}
