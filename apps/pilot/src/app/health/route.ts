export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    service: "ai-growth-os-pilot",
    scope: "process_only",
  }, { headers: { "Cache-Control": "no-store" } });
}

