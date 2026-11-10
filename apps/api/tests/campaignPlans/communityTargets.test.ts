import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { planSchema, type CampaignPlan } from "../../src/modules/campaignPlans/schemas";
import { applyCommunityGrowthPlan, clampDailyInviteLimit } from "../../src/modules/community/targets";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const SNAPSHOT_ID = "20000000-0000-4000-8000-000000000001";
const PLAN_ID = "50000000-0000-4000-8000-000000000099";
const ARTIFACT_ID = "70000000-0000-4000-8000-000000000099";

function buildPlan(overrides: Partial<CampaignPlan> = {}): CampaignPlan {
  return {
    contract_version: "growth-lead-plan-v2",
    plan_id: PLAN_ID,
    workspace_id: WORKSPACE_ID,
    input_version: 1,
    profile_version: 1,
    context_snapshot_id: SNAPSHOT_ID,
    status: "proposed",
    objective: "Grow Da Nang expat & travel community organically with grounded guides",
    selection_method: "model_selection_from_grounded_research",
    selected_opportunity: {
      topic: "Da Nang rental guide",
      audience_fit: "Expats relocating to Da Nang for 1-6 months",
      offer_fit: "Connects readers with TripC Verified Rentals & local Group",
      rationale: "High expat demand",
      evidence: {
        source_id: "30000000-0000-4000-8000-000000000001",
        source_version: 1,
        chunk_id: "chunk-1",
        locator: "p:1",
        quote: "An Thuong and My An are popular expat areas in Da Nang.",
        source_url: "https://tripc.vn/da-nang-rentals",
        license: "owned",
        attribution: "TripC",
      },
      url: "https://tripc.vn/da-nang-rentals",
      fetched_at: "2026-11-01T00:00:00Z",
      confidence: "hypothesis",
      demand_estimate: null,
    },
    research_artifact: {
      artifact_id: "40000000-0000-4000-8000-000000000001",
      workspace_id: WORKSPACE_ID,
      version: 1,
      content_hash: "a".repeat(64),
      role: "research",
      context_snapshot_id: SNAPSHOT_ID,
      storage: "ai_run_store",
    },
    tasks: [
      {
        task_id: "60000000-0000-4000-8000-000000000001",
        role: "seo",
        operation: "seo.local_draft",
        tools: ["knowledge.read", "content.draft"],
        depends_on: [],
        input_artifact_refs: [
          {
            artifact_id: "40000000-0000-4000-8000-000000000001",
            workspace_id: WORKSPACE_ID,
            version: 1,
            content_hash: "a".repeat(64),
            role: "research",
            context_snapshot_id: SNAPSHOT_ID,
            storage: "ai_run_store",
          },
        ],
        dependency_artifact_from: [],
        brief: {
          topic: "Da Nang rental guide",
          audience: ["expats"],
          offer: ["TripC Verified Rentals"],
          audience_fit: "Expats seeking medium-stay housing advice",
          offer_fit: "Matches TripC accommodation & community Q&A",
          intent: "informational",
          deliverable: "seo_article_draft",
          cta: "Join the Da Nang community group",
          acceptance: ["Cited facts only"],
        },
        requires_human_approval: true,
        deadline: new Date(Date.now() + 86_400_000).toISOString(),
      },
    ],
    missing_facts: [],
    requires_human_approval: true,
    applied: false,
    synthetic: false,
    community_growth_plan: {
      source: "growth_lead_agent",
      auto_apply: true,
      current_members: 5,
      pacing_status: "on_track",
      recommended_daily_invite_limit: 12,
      recommended_auto_reply_comments: true,
      recommended_auto_invite_enabled: true,
      week1_target: 5,
      week2_target: 10,
      week3_target: 18,
      week4_target: 30,
      weekly_targets: [
        {
          week: 1,
          label: "Tuần 1 (02/11 – 08/11)",
          member_target: 5,
          weekly_new_target: 5,
          focus: "Xây nền tảng thành viên đầu tiên",
          channel_tactic: "Đăng bài cẩm nang hữu ích + gắn CTA Group trên Website",
        },
        {
          week: 2,
          label: "Tuần 2 (09/11 – 15/11)",
          member_target: 10,
          weekly_new_target: 5,
          focus: "Khai thác khách hỏi Messenger & Comment",
          channel_tactic: "Auto-reply comment RAG + mời an toàn <= 12 lượt/ngày",
        },
        {
          week: 3,
          label: "Tuần 3 (16/11 – 22/11)",
          member_target: 18,
          weekly_new_target: 8,
          focus: "Mở rộng nhóm thuê căn hộ dài hạn",
          channel_tactic: "Mời qua nút Mời Facebook Group + thảo luận mở",
        },
        {
          week: 4,
          label: "Tuần 4 (23/11 – 30/11)",
          member_target: 30,
          weekly_new_target: 12,
          focus: "Tăng trưởng ổn định cuối tháng",
          channel_tactic: "Chủ đề từ SearXNG Radar + kéo traffic Web về Group",
        },
      ],
      rationale: "Bắt đầu từ 5 thành viên thật, tăng nhịp đều +5/+8/+12 dựa trên quota 12 lời mời an toàn/ngày.",
      focus_channels: ["facebook_group", "messenger", "page_comments"],
    },
    ...overrides,
  };
}

describe("Growth Lead -> Community Target Auto-Application", () => {
  it("clampDailyInviteLimit keeps invites strictly within 10..15/day safe Facebook corridor", () => {
    expect(clampDailyInviteLimit(undefined, 12)).toBe(12);
    expect(clampDailyInviteLimit(3, 12)).toBe(10);
    expect(clampDailyInviteLimit(13.6, 12)).toBe(14);
    expect(clampDailyInviteLimit(50, 12)).toBe(15);
  });

  it("planSchema validates dynamic community_growth_plan emitted by Growth Lead Agent", () => {
    const plan = buildPlan();
    const parsed = planSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.community_growth_plan?.week1_target).toBe(5);
      expect(parsed.data.community_growth_plan?.week2_target).toBe(10);
      expect(parsed.data.community_growth_plan?.week3_target).toBe(18);
      expect(parsed.data.community_growth_plan?.week4_target).toBe(30);
      expect(parsed.data.community_growth_plan?.recommended_daily_invite_limit).toBe(12);
    }
  });

  it("applyCommunityGrowthPlan updates community_hub_settings automatically unless target_source is locked_manual", async () => {
    const recorded: { sql: string; params?: unknown[] }[] = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      recorded.push({ sql, params });
      if (sql.includes("SELECT target_source FROM community_hub_settings")) {
        return { rows: [{ target_source: "growth_lead_agent" }] };
      }
      return { rows: [], rowCount: 1 };
    });
    const pool = { query } as unknown as Pool;
    const plan = buildPlan();

    const res = await applyCommunityGrowthPlan(pool, plan, ARTIFACT_ID);
    expect(res).toEqual({
      applied: true,
      week1_target: 5,
      week2_target: 10,
      week3_target: 18,
      week4_target: 30,
      daily_invite_limit: 12,
    });
    const updateCall = recorded.find((r) => r.sql.includes("UPDATE community_hub_settings"));
    expect(updateCall).toBeTruthy();
    expect(updateCall?.params).toEqual(
      expect.arrayContaining([WORKSPACE_ID, 5, 10, 18, 30, 12, ARTIFACT_ID, PLAN_ID]),
    );
  });

  it("applyCommunityGrowthPlan preserves locked_manual unless forceOverrideManual is true", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT target_source FROM community_hub_settings")) {
        return { rows: [{ target_source: "locked_manual" }] };
      }
      return { rows: [], rowCount: 1 };
    });
    const pool = { query } as unknown as Pool;
    const plan = buildPlan();

    const blocked = await applyCommunityGrowthPlan(pool, plan, ARTIFACT_ID);
    expect(blocked).toEqual({ applied: false, reason: "LOCKED_MANUAL" });
    expect(query.mock.calls.some(([s]) => String(s).includes("UPDATE community_hub_settings"))).toBe(false);

    const forced = await applyCommunityGrowthPlan(pool, plan, ARTIFACT_ID, { forceOverrideManual: true });
    expect(forced.applied).toBe(true);
    expect(query.mock.calls.some(([s]) => String(s).includes("UPDATE community_hub_settings"))).toBe(true);
  });
});
