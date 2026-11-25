import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { AppError } from "@/lib/errors";
import { exchangeGoogleCode, readIdToken, saveGoogleConnection } from "@/modules/google/connection";
import { resolveSafeWebOrigin, verifyOAuthState } from "@/modules/integrations/tiktok";

function back(origin: string, path: string, params: Record<string, string>) {
  const url = new URL(path, origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url.toString());
}

/** Google sends the owner back here after consent; always ends with a redirect to the web app. */
export async function GET(req: NextRequest) {
  const stateParam = req.nextUrl.searchParams.get("state");
  if (!stateParam) return back(resolveSafeWebOrigin(null), "/gmaps", { google_error: "Thiếu state OAuth từ Google." });
  let state;
  try {
    state = verifyOAuthState(stateParam);
  } catch (error) {
    return back(resolveSafeWebOrigin(null), "/gmaps", { google_error: (error as Error).message });
  }
  const error = req.nextUrl.searchParams.get("error");
  if (error) return back(state.web_origin, state.return_to, { google_error: error === "access_denied" ? "Bạn đã từ chối cấp quyền." : error });
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return back(state.web_origin, state.return_to, { google_error: "Google không trả mã xác thực." });
  try {
    // The person who started the flow must still be an owner of that workspace.
    const owner = await pool.query(
      `SELECT 1 FROM memberships WHERE user_id = $1::uuid AND workspace_id = $2::uuid AND role = 'owner' AND status = 'active'`,
      [state.user_id, state.workspace_id],
    );
    if (!owner.rowCount) throw new AppError(403, "FORBIDDEN", "Chỉ owner của workspace được kết nối Google.");
    const tokens = await exchangeGoogleCode(code);
    const id = readIdToken(tokens.idToken);
    await saveGoogleConnection(pool, {
      workspaceId: state.workspace_id,
      userId: state.user_id,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scopes,
      email: id.email,
      subject: id.sub,
    });
    return back(state.web_origin, state.return_to, { google: "connected", ...(id.email ? { google_email: id.email } : {}) });
  } catch (err) {
    const message = err instanceof AppError ? err.message : (err as Error).message || "Kết nối Google thất bại.";
    return back(state.web_origin, state.return_to, { google_error: message.slice(0, 200) });
  }
}
