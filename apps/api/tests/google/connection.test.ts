import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_SCOPES,
  buildGoogleAuthorizeUrl,
  exchangeGoogleCode,
  readIdToken,
  saveGoogleConnection,
  workspaceGoogleAuth,
} from "@/modules/google/connection";
import { verifyOAuthState } from "@/modules/integrations/tiktok";
import { openSecret } from "@/lib/secretBox";

const WS = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const env = { ...process.env };

function setClient() {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id.apps.googleusercontent.com";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret";
  process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://api.example.test/v1/integrations/google/callback";
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret";
}

afterEach(() => {
  process.env = { ...env };
});

describe("Kết nối Google bằng OAuth", () => {
  it("asks Google for offline Drive + Business Profile access with a signed state back to the Drive tab", () => {
    setClient();
    const { url, redirect_uri } = buildGoogleAuthorizeUrl({ workspaceId: WS, userId: USER, webOrigin: null });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("scope")!.split(" ")).toEqual(GOOGLE_SCOPES);
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("redirect_uri")).toBe(redirect_uri);
    const state = verifyOAuthState(u.searchParams.get("state")!);
    expect(state).toMatchObject({ workspace_id: WS, user_id: USER, return_to: "/gmaps?tab=drive_assets" });
  });

  it("refuses to build the URL when the server has no OAuth client", () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    expect(() => buildGoogleAuthorizeUrl({ workspaceId: WS, userId: USER })).toThrow(/GOOGLE_OAUTH_CLIENT_ID/);
  });

  it("exchanges the code and insists on a refresh token", async () => {
    setClient();
    const idToken = `x.${Buffer.from(JSON.stringify({ email: "owner@example.com", sub: "123" })).toString("base64url")}.y`;
    const fetchOk = vi.fn(async () => new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", scope: "openid email", id_token: idToken })));
    const tokens = await exchangeGoogleCode("code-1", fetchOk);
    expect(tokens.refreshToken).toBe("rt");
    expect(readIdToken(tokens.idToken)).toEqual({ email: "owner@example.com", sub: "123" });
    const body = String((fetchOk.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(body).toContain("grant_type=authorization_code");
    const noRefresh = vi.fn(async () => new Response(JSON.stringify({ access_token: "at" })));
    await expect(exchangeGoogleCode("code-2", noRefresh)).rejects.toThrow(/refresh token/);
  });

  it("stores the refresh token sealed, never in clear", async () => {
    setClient();
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    await saveGoogleConnection({ query } as never, { workspaceId: WS, userId: USER, refreshToken: "secret-refresh", scopes: GOOGLE_SCOPES, email: "a@b.c", subject: "1" });
    const params = (query.mock.calls[0] as unknown as [string, unknown[]])[1];
    expect(params).not.toContain("secret-refresh");
    expect(openSecret(String(params[4]))).toBe("secret-refresh");
  });

  it("uses the workspace's own account before the server-wide token", async () => {
    setClient();
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = "server-refresh";
    const sealed = (await import("@/lib/secretBox")).sealSecret("workspace-refresh");
    const db = { query: vi.fn(async () => ({ rows: [{ google_email: "a@b.c", scopes: [], refresh_token_enc: sealed, connected_at: new Date(), last_error: null }] })) };
    const fetchToken = vi.fn(async () => new Response(JSON.stringify({ access_token: "ws-access", expires_in: 3600 })));
    const auth = await workspaceGoogleAuth(db as never, WS, fetchToken);
    expect(await auth.accessToken()).toBe("ws-access");
    const body = String((fetchToken.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(body).toContain("refresh_token=workspace-refresh");
    expect(body).not.toContain("server-refresh");
  });
});
