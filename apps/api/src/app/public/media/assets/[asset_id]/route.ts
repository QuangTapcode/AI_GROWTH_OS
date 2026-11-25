import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { handleApiError } from "@/lib/errors";
import { renderWatermarkedAsset, verifyAssetSignature } from "@/modules/assets/media";

export const runtime = "nodejs";

/**
 * Ảnh món đã gắn watermark, phục vụ cho Facebook/Instagram/Google tải về khi đăng bài.
 * Link có chữ ký HMAC + hạn dùng (tạo bởi signedAssetPath), không cần đăng nhập.
 */
export async function GET(req: NextRequest, { params }: { params: { asset_id: string } }) {
  const ws = req.nextUrl.searchParams.get("ws") ?? "";
  const exp = Number(req.nextUrl.searchParams.get("exp"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(ws) || !/^[0-9a-f-]{36}$/i.test(params.asset_id) || !verifyAssetSignature(ws, params.asset_id, exp, sig)) {
    return NextResponse.json({ error: { code: "INVALID_SIGNATURE" } }, { status: 403 });
  }
  try {
    const file = await renderWatermarkedAsset(pool, ws, params.asset_id);
    const body = fs.readFileSync(file);
    return new NextResponse(body, {
      status: 200,
      headers: { "content-type": "image/jpeg", "content-length": String(body.length), "cache-control": "public, max-age=86400" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
