import type { Pool } from "pg";
import { DriveAssetIngestionService } from "../assets/drive";
import { processReceivedCommunityMessages } from "../community/service";
import { computeFunnel } from "../communityGrowth/funnel";
import { GoogleMapsSpecialistService } from "../gmaps/specialist";
import { ContentPlannerService, weekStartOf } from "../planner/calendar";
import { CalendarPublisherService } from "../publisher/calendarPublisher";
import { DailyExecutiveReportService, vnDate } from "../reports/dailyExecutive";
import { loadMerchantProfile } from "./profile";
import type { MerchantAgentId } from "./prompts";

/**
 * Nhịp vận hành của 8 agent merchant. Worker gọi POST /internal/merchant/tick mỗi phút; mỗi agent có chu kỳ riêng
 * và được khóa (locked_until) để hai tick chồng nhau không chạy trùng một agent.
 */
const INTERVAL_MS: Record<MerchantAgentId, number> = {
  inbox_concierge: 60_000, // tin nhắn: mỗi phút (SLA < 1 phút với webhook, < 2 phút khi chỉ polling)
  comment_reply: 60_000,
  publisher: 60_000,
  gmaps_specialist: 3 * 60_000, // review Maps: trả lời trong < 5 phút
  asset_manager: 20 * 60_000, // Drive: 15–30 phút theo kế hoạch
  content_planner: 6 * 3600_000,
  growth_lead: 15 * 60_000, // kiểm tra giờ gửi báo cáo tối
  community_growth: 6 * 3600_000,
};
const LOCK_MS = 10 * 60_000;
const VN_OFFSET_MS = 7 * 3600_000;

export interface AgentRunResult {
  agent: MerchantAgentId;
  status: "ok" | "skipped" | "failed" | "not_connected";
  detail: Record<string, unknown>;
}

async function claim(db: Pool, workspaceId: string, agent: MerchantAgentId): Promise<boolean> {
  await db.query(
    `INSERT INTO merchant_agent_runs (workspace_id, agent, next_run_at) VALUES ($1::uuid, $2, NOW()) ON CONFLICT (workspace_id, agent) DO NOTHING`,
    [workspaceId, agent],
  );
  const res = await db.query(
    `UPDATE merchant_agent_runs SET locked_until = NOW() + ($3::int * INTERVAL '1 millisecond'), last_started_at = NOW()
      WHERE workspace_id = $1::uuid AND agent = $2 AND next_run_at <= NOW() AND (locked_until IS NULL OR locked_until < NOW())
      RETURNING agent`,
    [workspaceId, agent, LOCK_MS],
  );
  return res.rows.length > 0;
}

async function finish(db: Pool, workspaceId: string, result: AgentRunResult): Promise<void> {
  await db.query(
    `UPDATE merchant_agent_runs SET locked_until = NULL, last_finished_at = NOW(), last_status = $3, last_detail = $4::jsonb,
            next_run_at = NOW() + ($5::int * INTERVAL '1 millisecond')
      WHERE workspace_id = $1::uuid AND agent = $2`,
    [workspaceId, result.agent, result.status, JSON.stringify(result.detail).slice(0, 4000), INTERVAL_MS[result.agent]],
  );
}

async function ownerActor(db: Pool, workspaceId: string): Promise<string | null> {
  const row = (
    await db.query(`SELECT user_id FROM memberships WHERE workspace_id = $1::uuid AND role = 'owner' AND status = 'active' ORDER BY created_at LIMIT 1`, [workspaceId])
  ).rows[0];
  return row?.user_id ?? null;
}

export async function runAgent(db: Pool, workspaceId: string, agent: MerchantAgentId, now = new Date()): Promise<AgentRunResult> {
  switch (agent) {
    case "asset_manager": {
      const r = await new DriveAssetIngestionService(db).scanDrive(workspaceId);
      return { agent, status: r.status === "ok" ? "ok" : "not_connected", detail: { ...r } };
    }
    case "gmaps_specialist": {
      const r = await new GoogleMapsSpecialistService(db).syncAndAutoReplyAllReviews(workspaceId);
      return { agent, status: r.status === "ok" ? "ok" : "not_connected", detail: { ...r } };
    }
    case "publisher": {
      const service = new CalendarPublisherService(db);
      const stats = await service.publishDue(workspaceId);
      const reconciled = await service.reconcileTikTok(workspaceId);
      return { agent, status: "ok", detail: { ...stats, tiktok_reconciled: reconciled } };
    }
    case "content_planner": {
      const planner = new ContentPlannerService(db);
      const local = new Date(now.getTime() + VN_OFFSET_MS);
      const weekday = (local.getUTCDay() + 6) % 7;
      // Tối Chủ nhật lập lịch tuần sau; các ngày khác chỉ lấp tuần hiện tại nếu còn trống.
      const target = weekday === 6 && local.getUTCHours() >= 18 ? weekStartOf(new Date(now.getTime() + 86400_000)) : weekStartOf(now);
      const { entries } = await planner.listWeek(workspaceId, target);
      if (entries.length > 0) return { agent, status: "skipped", detail: { week_start: target, existing: entries.length } };
      const r = await planner.generateWeek(workspaceId, target);
      return { agent, status: "ok", detail: { week_start: r.week_start, created: r.created, generated_by: r.generated_by } };
    }
    case "growth_lead": {
      const profile = await loadMerchantProfile(db, workspaceId);
      const hour = profile.settings.report_hour_local ?? 21;
      const localHour = new Date(now.getTime() + VN_OFFSET_MS).getUTCHours();
      if (localHour < hour) return { agent, status: "skipped", detail: { reason: "before_report_hour", report_hour_local: hour } };
      const report = await new DailyExecutiveReportService(db).generateAndDeliver(workspaceId, vnDate(now));
      return { agent, status: "ok", detail: { report_date: report.report_date, delivery: report.delivery } };
    }
    case "comment_reply": {
      // Bình luận được xử lý chung một lượt với tin nhắn (inbox_concierge); ở đây chỉ ghi nhận số liệu giờ qua.
      const stats = (
        await db.query(
          `SELECT COUNT(*) FILTER (WHERE status = 'replied')::int AS replied, COUNT(*) FILTER (WHERE status = 'escalated')::int AS escalated,
                  COUNT(*) FILTER (WHERE status = 'ignored')::int AS spam
             FROM community_messages WHERE workspace_id = $1::uuid AND platform IN ('facebook_comment', 'instagram_comment') AND updated_at > NOW() - INTERVAL '1 hour'`,
          [workspaceId],
        )
      ).rows[0];
      return { agent, status: "ok", detail: { last_hour: stats } };
    }
    case "inbox_concierge": {
      const actor = await ownerActor(db, workspaceId);
      if (!actor) return { agent, status: "skipped", detail: { reason: "no_owner" } };
      const context = (
        await db.query(`SELECT snapshot_id FROM knowledge_contexts WHERE workspace_id = $1::uuid AND current = true LIMIT 1`, [workspaceId])
      ).rows[0];
      const enqueued = await processReceivedCommunityMessages(db, workspaceId, actor, context?.snapshot_id ?? null, 20);
      return { agent, status: "ok", detail: { enqueued_for_rag: enqueued, knowledge_context: Boolean(context) } };
    }
    case "community_growth": {
      const funnel = await computeFunnel(db, workspaceId, now);
      return { agent, status: funnel.status === "not_activated" ? "skipped" : "ok", detail: { status: funnel.status, current_members: funnel.current_members, planned: funnel.planned_members_now } };
    }
    default:
      return { agent, status: "skipped", detail: {} };
  }
}

const ORDER: MerchantAgentId[] = ["inbox_concierge", "comment_reply", "gmaps_specialist", "publisher", "asset_manager", "content_planner", "community_growth", "growth_lead"];

export async function tickMerchantAgents(db: Pool, now = new Date()): Promise<Array<{ workspace_id: string; runs: AgentRunResult[] }>> {
  const workspaces = (await db.query(`SELECT workspace_id FROM merchant_onboarding WHERE onboarding_completed = true ORDER BY updated_at LIMIT 100`)).rows;
  const out: Array<{ workspace_id: string; runs: AgentRunResult[] }> = [];
  for (const { workspace_id: workspaceId } of workspaces) {
    const runs: AgentRunResult[] = [];
    for (const agent of ORDER) {
      if (!(await claim(db, workspaceId, agent))) continue;
      let result: AgentRunResult;
      try {
        result = await runAgent(db, workspaceId, agent, now);
      } catch (err) {
        result = { agent, status: "failed", detail: { error: (err as Error).message.slice(0, 500) } };
        console.error(`[merchant-tick] ${workspaceId} ${agent} failed:`, (err as Error).message);
      }
      await finish(db, workspaceId, result).catch((err) => console.error("[merchant-tick] finish failed", err));
      runs.push(result);
    }
    out.push({ workspace_id: workspaceId, runs });
  }
  return out;
}
