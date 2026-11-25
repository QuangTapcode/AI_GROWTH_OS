import type { Pool } from "pg";
import defaultPool from "../../lib/db";
import { loadMerchantProfile } from "../merchant/profile";

/**
 * Agent 8 — Community Growth: phễu kéo khách vào Group/ Zalo khách quen, mục tiêu mặc định 1.000 thành viên trong 12 tuần.
 * Điểm chạm của phễu (đều đã chạy thật trong hệ thống):
 *   1. Bàn ăn: mã QR in đặt bàn trỏ tới link nhóm (table_qr_url).
 *   2. Bình luận Fanpage: Agent 6 gắn lời mời vào nhóm (giới hạn 10–15 lời mời/ ngày).
 *   3. Tin nhắn đặt bàn: Agent 7 gửi link nhóm sau khi chốt bàn.
 *   4. Trong nhóm: lịch đăng mini game (Thứ 3) và bình chọn món (Thứ 6) do Agent 3 lập.
 * Số thành viên lấy từ community_member_snapshots (Group Bot/ Graph đồng bộ) — không có số liệu thì báo "chưa đo".
 */
export const MILESTONE_SHARE = [
  { week: 1, share: 0.05 },
  { week: 2, share: 0.12 },
  { week: 4, share: 0.3 },
  { week: 6, share: 0.45 },
  { week: 8, share: 0.65 },
  { week: 10, share: 0.82 },
  { week: 12, share: 1 },
];

export function plannedMembersAt(weekNumber: number, target: number): number {
  if (weekNumber <= 0) return 0;
  const after = MILESTONE_SHARE.find((m) => m.week >= weekNumber) ?? MILESTONE_SHARE[MILESTONE_SHARE.length - 1];
  const beforeIdx = MILESTONE_SHARE.indexOf(after) - 1;
  const before = beforeIdx >= 0 ? MILESTONE_SHARE[beforeIdx] : { week: 0, share: 0 };
  const ratio = after.week === before.week ? 1 : (weekNumber - before.week) / (after.week - before.week);
  return Math.round(target * (before.share + (after.share - before.share) * Math.min(1, ratio)));
}

export interface FunnelState {
  target_members: number;
  group_url: string | null;
  table_qr_url: string | null;
  activated_at: string | null;
  current_week: number | null;
  current_members: number | null;
  measured_at: string | null;
  planned_members_now: number | null;
  status: "not_measured" | "ahead" | "on_track" | "behind" | "not_activated";
  members_needed_per_week: number | null;
  touchpoints_7d: { comment_invites: number; booking_invites: number; group_posts_published: number };
  milestones: Array<{ week: number; planned: number }>;
}

export async function computeFunnel(db: Pick<Pool, "query"> = defaultPool, workspaceId: string, now = new Date()): Promise<FunnelState> {
  const profile = await loadMerchantProfile(db, workspaceId);
  const target = profile.settings.community_target_members ?? 1000;
  const groupUrl = profile.settings.zalo_group_url ?? profile.links.group;
  const [activation, snapshot, invites, posts] = await Promise.all([
    db.query(`SELECT activated_at FROM merchant_onboarding WHERE workspace_id = $1::uuid`, [workspaceId]),
    db.query(`SELECT group_member_count, captured_at FROM community_member_snapshots WHERE workspace_id = $1::uuid ORDER BY captured_at DESC LIMIT 1`, [workspaceId]),
    db.query(
      `SELECT COUNT(*) FILTER (WHERE channel IN ('page_private_reply_invite', 'telegram_community_invite'))::int AS comment_invites
         FROM community_invite_logs WHERE workspace_id = $1::uuid AND status = 'invited' AND invited_at > NOW() - INTERVAL '7 days'`,
      [workspaceId],
    ),
    db.query(
      `SELECT COUNT(*) FILTER (WHERE channel = 'facebook_group' AND status = 'published')::int AS group_posts,
              (SELECT COUNT(*)::int FROM booking_leads b WHERE b.workspace_id = $1::uuid AND b.created_at > NOW() - INTERVAL '7 days' AND b.metadata->>'source' = 'inbox_concierge') AS booking_invites
         FROM content_calendar_entries WHERE workspace_id = $1::uuid AND published_at > NOW() - INTERVAL '7 days'`,
      [workspaceId],
    ),
  ]);
  const activatedAt: Date | null = activation.rows[0]?.activated_at ? new Date(activation.rows[0].activated_at) : null;
  const week = activatedAt ? Math.max(1, Math.ceil((now.getTime() - activatedAt.getTime()) / (7 * 86400_000))) : null;
  const current = snapshot.rows[0] ? Number(snapshot.rows[0].group_member_count) : null;
  const planned = week ? plannedMembersAt(week, target) : null;
  let status: FunnelState["status"] = "not_activated";
  if (activatedAt) {
    if (current === null || planned === null) status = "not_measured";
    else if (current >= planned * 1.1) status = "ahead";
    else if (current >= planned * 0.9) status = "on_track";
    else status = "behind";
  }
  const weeksLeft = week ? Math.max(1, 12 - week) : null;
  return {
    target_members: target,
    group_url: groupUrl,
    table_qr_url: groupUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=16&data=${encodeURIComponent(groupUrl)}` : null,
    activated_at: activatedAt ? activatedAt.toISOString() : null,
    current_week: week,
    current_members: current,
    measured_at: snapshot.rows[0]?.captured_at ? new Date(snapshot.rows[0].captured_at).toISOString() : null,
    planned_members_now: planned,
    status,
    members_needed_per_week: current !== null && weeksLeft ? Math.max(0, Math.ceil((target - current) / weeksLeft)) : null,
    touchpoints_7d: {
      comment_invites: Number(invites.rows[0]?.comment_invites ?? 0),
      booking_invites: Number(posts.rows[0]?.booking_invites ?? 0),
      group_posts_published: Number(posts.rows[0]?.group_posts ?? 0),
    },
    milestones: MILESTONE_SHARE.map((m) => ({ week: m.week, planned: Math.round(target * m.share) })),
  };
}
