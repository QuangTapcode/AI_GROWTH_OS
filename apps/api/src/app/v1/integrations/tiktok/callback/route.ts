import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import {
  exchangeTikTokCode,
  fetchTikTokUserInfo,
  resolveSafeWebOrigin,
  saveTikTokOAuthConnection,
  verifyOAuthState,
} from "@/modules/integrations/tiktok";

function buildRedirectUrl(
  baseOrigin: string,
  returnPath: string,
  params: Record<string, string>,
): string {
  const url = new URL(returnPath, baseOrigin);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export async function GET(req: NextRequest) {
  const stateParam = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const oauthError = req.nextUrl.searchParams.get("error");
  const oauthErrorDesc = req.nextUrl.searchParams.get("error_description");

  if (!stateParam) {
    return NextResponse.redirect(
      buildRedirectUrl(resolveSafeWebOrigin(null), "/distribution", {
        tiktok_error: "Missing OAuth state from TikTok callback.",
      }),
    );
  }

  let verifiedState;
  try {
    verifiedState = verifyOAuthState(stateParam);
  } catch (err) {
    return handleApiError(err);
  }

  if (oauthError) {
    return NextResponse.redirect(
      buildRedirectUrl(verifiedState.web_origin, verifiedState.return_to, {
        tiktok_error: oauthErrorDesc || oauthError,
      }),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      buildRedirectUrl(verifiedState.web_origin, verifiedState.return_to, {
        tiktok_error: "Missing authorization code from TikTok.",
      }),
    );
  }

  try {
    const tokens = await exchangeTikTokCode(code);
    const profile = await fetchTikTokUserInfo(tokens.access_token);
    const summary = await saveTikTokOAuthConnection({
      workspaceId: verifiedState.workspace_id,
      actorUserId: verifiedState.user_id,
      tokens,
      profile,
    });

    return NextResponse.redirect(
      buildRedirectUrl(verifiedState.web_origin, verifiedState.return_to, {
        tiktok: "connected",
        tiktok_name: summary.display_name || summary.open_id || "TikTok",
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "TikTok connection failed.";
    return NextResponse.redirect(
      buildRedirectUrl(verifiedState.web_origin, verifiedState.return_to, {
        tiktok_error: msg,
      }),
    );
  }
}

