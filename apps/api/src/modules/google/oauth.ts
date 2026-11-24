/**
 * Access token Google phía server từ refresh token (OAuth 2.0, đã được chủ quán cấp một lần).
 * Scope cần: https://www.googleapis.com/auth/business.manage (Google Maps / Business Profile)
 *            https://www.googleapis.com/auth/drive.readonly (đọc ảnh trong thư mục Drive)
 * Khóa chỉ nằm trong env của API; trình duyệt và AI không bao giờ thấy.
 */
import type { FetchLike } from "../ai/providers";

export class GoogleNotConnectedError extends Error {
  constructor(message = "Google chưa được kết nối (thiếu GOOGLE_OAUTH_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN)") {
    super(message);
    this.name = "GoogleNotConnectedError";
  }
}

export class GoogleApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

export interface GoogleAuth {
  /** Bearer token, hoặc null khi chỉ có API key (đủ cho thư mục Drive công khai). */
  accessToken(): Promise<string | null>;
  apiKey(): string | null;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

export function googleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim(),
  );
}

export function createGoogleAuth(fetchImpl: FetchLike = (u, i) => fetch(u, i), now: () => number = Date.now): GoogleAuth {
  let cached: CachedToken | null = null;
  return {
    apiKey: () => process.env.GOOGLE_API_KEY?.trim() || null,
    async accessToken() {
      if (!googleOAuthConfigured()) return null;
      if (cached && cached.expiresAt - 60_000 > now()) return cached.token;
      const body = new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!.trim(),
        refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN!.trim(),
        grant_type: "refresh_token",
      });
      const res = await fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      if (!res.ok) throw new GoogleApiError(res.status, `Google token refresh failed (HTTP ${res.status})`, text.slice(0, 300));
      const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
      if (!json.access_token) throw new GoogleApiError(500, "Google token response has no access_token");
      cached = { token: json.access_token, expiresAt: now() + (json.expires_in ?? 3600) * 1000 };
      return cached.token;
    },
  };
}

let sharedAuth: GoogleAuth | null = null;
export function defaultGoogleAuth(): GoogleAuth {
  if (!sharedAuth) sharedAuth = createGoogleAuth();
  return sharedAuth;
}

export async function googleFetch(
  auth: GoogleAuth,
  url: string,
  init: RequestInit & { allowApiKey?: boolean } = {},
  fetchImpl: FetchLike = (u, i) => fetch(u, i),
): Promise<Response> {
  const token = await auth.accessToken();
  const headers = new Headers(init.headers);
  let finalUrl = url;
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  } else if (init.allowApiKey && auth.apiKey()) {
    finalUrl += `${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(auth.apiKey()!)}`;
  } else {
    throw new GoogleNotConnectedError();
  }
  const { allowApiKey: _ignored, ...rest } = init;
  return fetchImpl(finalUrl, { ...rest, headers, signal: rest.signal ?? AbortSignal.timeout(20_000) });
}

export async function googleJson<T>(
  auth: GoogleAuth,
  url: string,
  init: RequestInit & { allowApiKey?: boolean } = {},
  fetchImpl?: FetchLike,
): Promise<T> {
  const res = await googleFetch(auth, url, init, fetchImpl);
  const text = await res.text();
  if (!res.ok) throw new GoogleApiError(res.status, `Google API HTTP ${res.status} for ${url.split("?")[0]}`, text.slice(0, 500));
  return (text ? JSON.parse(text) : {}) as T;
}
