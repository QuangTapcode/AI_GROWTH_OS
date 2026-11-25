import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

/**
 * Hồi quy bảo mật: mọi route của 8 agent merchant phải từ chối request không đăng nhập (401) trước khi
 * chạm DB. Trước đây các route này mở công khai (đọc được cả API key LLM).
 */
const WS = "33333333-3333-4333-8333-333333333333";
const ID = "44444444-4444-4444-8444-444444444444";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: NextRequest, ctx: any) => Promise<Response>;

const routes: Array<[string, () => Promise<any>, string[]]> = [
  ["admin/llm-config", () => import("@/app/v1/workspaces/[workspace_id]/admin/llm-config/route"), ["GET", "POST"]],
  ["admin/llm-config/test-ping", () => import("@/app/v1/workspaces/[workspace_id]/admin/llm-config/test-ping/route"), ["POST"]],
  ["gmaps/reputation", () => import("@/app/v1/workspaces/[workspace_id]/gmaps/reputation/route"), ["GET"]],
  ["gmaps/sync", () => import("@/app/v1/workspaces/[workspace_id]/gmaps/sync/route"), ["POST"]],
  ["gmaps/reviews/reply", () => import("@/app/v1/workspaces/[workspace_id]/gmaps/reviews/reply/route"), ["POST"]],
  ["gmaps/posts", () => import("@/app/v1/workspaces/[workspace_id]/gmaps/posts/route"), ["GET", "POST"]],
  ["gmaps/menu", () => import("@/app/v1/workspaces/[workspace_id]/gmaps/menu/route"), ["POST"]],
  ["assets/drive/queue", () => import("@/app/v1/workspaces/[workspace_id]/assets/drive/queue/route"), ["GET"]],
  ["assets/drive/sync", () => import("@/app/v1/workspaces/[workspace_id]/assets/drive/sync/route"), ["POST"]],
  ["assets/drive/publish", () => import("@/app/v1/workspaces/[workspace_id]/assets/drive/publish/route"), ["POST"]],
  ["assets/drive/folder", () => import("@/app/v1/workspaces/[workspace_id]/assets/drive/folder/route"), ["PUT"]],
  ["integrations/google", () => import("@/app/v1/workspaces/[workspace_id]/integrations/google/route"), ["GET"]],
  ["integrations/google/auth-url", () => import("@/app/v1/workspaces/[workspace_id]/integrations/google/auth-url/route"), ["GET"]],
  ["integrations/google/disconnect", () => import("@/app/v1/workspaces/[workspace_id]/integrations/google/disconnect/route"), ["POST"]],
  ["booking/leads", () => import("@/app/v1/workspaces/[workspace_id]/booking/leads/route"), ["GET", "POST"]],
  ["booking/leads/:id", () => import("@/app/v1/workspaces/[workspace_id]/booking/leads/[lead_id]/route"), ["PATCH"]],
  ["wallet", () => import("@/app/v1/workspaces/[workspace_id]/wallet/route"), ["GET"]],
  ["wallet/topup", () => import("@/app/v1/workspaces/[workspace_id]/wallet/topup/route"), ["POST"]],
  ["wallet/confirm", () => import("@/app/v1/workspaces/[workspace_id]/wallet/confirm/route"), ["POST"]],
  ["onboarding", () => import("@/app/v1/workspaces/[workspace_id]/onboarding/route"), ["GET", "POST"]],
  ["onboarding/settings", () => import("@/app/v1/workspaces/[workspace_id]/onboarding/settings/route"), ["PUT"]],
  ["reports/daily-executive", () => import("@/app/v1/workspaces/[workspace_id]/reports/daily-executive/route"), ["GET", "POST"]],
  ["calendar", () => import("@/app/v1/workspaces/[workspace_id]/calendar/route"), ["GET"]],
  ["calendar/generate", () => import("@/app/v1/workspaces/[workspace_id]/calendar/generate/route"), ["POST"]],
  ["calendar/review", () => import("@/app/v1/workspaces/[workspace_id]/calendar/review/route"), ["POST"]],
  ["community-growth/funnel", () => import("@/app/v1/workspaces/[workspace_id]/community-growth/funnel/route"), ["GET"]],
];

describe("Route 8 agent merchant yêu cầu đăng nhập", () => {
  for (const [name, load, methods] of routes) {
    for (const method of methods) {
      it(`${method} ${name} → 401 khi thiếu Bearer token`, async () => {
        const mod = await load();
        const req = new NextRequest(`http://localhost/v1/workspaces/${WS}/${name}`, {
          method,
          ...(method === "GET" ? {} : { body: "{}", headers: { "content-type": "application/json" } }),
        });
        const res = await mod[method](req, { params: { workspace_id: WS, lead_id: ID, entry_id: ID, post_id: ID } });
        expect(res.status).toBe(401);
      });
    }
  }

  it("webhook thanh toán từ chối khi sai khóa", async () => {
    const saved = process.env.PAYMENT_WEBHOOK_SECRET;
    process.env.PAYMENT_WEBHOOK_SECRET = "right-secret";
    const { POST } = await import("@/app/v1/webhooks/payments/route");
    const res = await POST(new NextRequest("http://localhost/v1/webhooks/payments", { method: "POST", body: "{}", headers: { authorization: "Apikey wrong-secret!" } }));
    expect(res.status).toBe(401);
    process.env.PAYMENT_WEBHOOK_SECRET = saved;
  });

  it("link ảnh công khai sai chữ ký → 403", async () => {
    const { GET } = await import("@/app/public/media/assets/[asset_id]/route");
    const res = await GET(new NextRequest(`http://localhost/public/media/assets/${ID}?ws=${WS}&exp=${Date.now() + 3600_000}&sig=deadbeef`), { params: { asset_id: ID } });
    expect(res.status).toBe(403);
  });
});
