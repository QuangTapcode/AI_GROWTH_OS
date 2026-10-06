import { randomUUID } from "node:crypto";
import { getEnvironment } from "@/lib/env";

function responseHeaders(request: Request) {
  const { allowedOrigins } = getEnvironment();
  const origin = request.headers.get("origin");
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  if (origin && !allowedOrigins.includes(origin)) return null;
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return headers;
}

function forbidden() {
  return Response.json({
    error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed.", request_id: randomUUID() },
  }, { status: 403, headers: { "Cache-Control": "no-store", Vary: "Origin" } });
}

export function healthResponse(request: Request) {
  const headers = responseHeaders(request);
  if (!headers) return forbidden();
  return Response.json({
    status: "ok",
    service: "ai-growth-os-api",
    environment: getEnvironment().environment,
    scope: "process_only",
    checked_at: new Date().toISOString(),
  }, { headers });
}

export function preflightResponse(request: Request) {
  const headers = responseHeaders(request);
  if (!headers) return forbidden();
  return new Response(null, { status: 204, headers });
}

