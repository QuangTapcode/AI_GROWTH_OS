import { NextRequest, NextResponse } from "next/server";

/**
 * CORS cho /v1/* (web gọi API bằng Bearer token) và /public/* (website TripC gọi posts/leads/events).
 * /v1/health tự xử lý CORS trong lib/health-response nên bị loại khỏi matcher.
 * Danh sách origin dùng chung CORS_ALLOWED_ORIGINS với lib/env.ts. CORS không phải authentication.
 */
const DEFAULT_ORIGINS = "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001";
const ALLOWED_METHODS = "GET, POST, PATCH, PUT, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type, Idempotency-Key";

function allowedOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS || DEFAULT_ORIGINS)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function forbiddenOrigin() {
  return NextResponse.json(
    { error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed.", request_id: crypto.randomUUID() } },
    { status: 403, headers: { "Cache-Control": "no-store", Vary: "Origin" } }
  );
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return NextResponse.next();
  if (!allowedOrigins().includes(origin)) return forbiddenOrigin();

  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": ALLOWED_METHODS,
        "Access-Control-Allow-Headers": ALLOWED_HEADERS,
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
  }

  const res = NextResponse.next();
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  return res;
}

export const config = {
  // /public/* is called by the TripC site from the browser (posts, leads, events).
  matcher: ["/v1/((?!health$).*)", "/public/:path*"],
};
