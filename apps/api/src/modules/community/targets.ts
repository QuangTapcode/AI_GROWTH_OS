import type { Pool, PoolClient } from 'pg';
import type { CampaignPlan } from '../campaignPlans/schemas';

export type DbLike = Pool | PoolClient;

export type TargetSource = 'growth_lead_agent' | 'manual' | 'locked_manual';

export interface WeeklyTargetPlanItem {
  week: number;
  label: string;
  member_target: number;
  weekly_new_target: number;
  focus: string;
  channel_tactic: string;
}

export interface AppliedCommunityPlanResult {
  applied: boolean;
  reason?: string;
  week1_target?: number;
  week2_target?: number;
  week3_target?: number;
  week4_target?: number;
  daily_invite_limit?: number;
}

export function clampDailyInviteLimit(value: unknown, fallback = 12): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(10, Math.min(15, Math.round(value)));
}

/**
 * Computes current campaign week (1..4+) from Vietnam calendar date (UTC+7), matching classifyVietnamCalendarWeek.
 */
export function currentVietnamCampaignWeek(now: Date = new Date()): number {
  const vnTime = new Date(now.getTime() + 7 * 3600_000);
  const y = vnTime.getUTCFullYear();
  const m = vnTime.getUTCMonth();
  const d = vnTime.getUTCDate();
  const targetMs = Date.UTC(y, m, d);
  const w2Start = Date.UTC(2026, 10, 9); // 09/11/2026
  const w3Start = Date.UTC(2026, 10, 16); // 16/11/2026
  const w4Start = Date.UTC(2026, 10, 23); // 23/11/2026
  const w5Start = Date.UTC(2026, 11, 1); // 01/12/2026
  if (targetMs < w2Start) return 1;
  if (targetMs < w3Start) return 2;
  if (targetMs < w4Start) return 3;
  if (targetMs < w5Start) return 4;
  return 4;
}

/**
 * Idempotently upgrades community tables and snapshot/invite logs.
 * When called inside a transaction (`inTransaction: true`), uses SAVEPOINT so partial/mock DB fixtures never abort the caller transaction.
 */
export async function ensureCommunityGrowthSchema(
  db: DbLike,
  options: { inTransaction?: boolean } = {},
): Promise<boolean> {
  const useSavepoint = Boolean(options.inTransaction);
  if (useSavepoint) {
    try {
      await db.query('SAVEPOINT sp_community_growth_schema');
    } catch {
      return false;
    }
  }
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS community_hub_settings (
        workspace_id UUID PRIMARY KEY,
        community_name VARCHAR(255) NOT NULL,
        group_url TEXT NOT NULL,
        publish_target VARCHAR(32) NOT NULL DEFAULT 'group',
        page_name VARCHAR(255) NOT NULL,
        page_url TEXT NOT NULL,
        positioning TEXT NOT NULL,
        group_member_count INT NOT NULL DEFAULT 5,
        week1_target INT NOT NULL DEFAULT 5,
        week2_target INT NOT NULL DEFAULT 10,
        week3_target INT NOT NULL DEFAULT 18,
        week4_target INT NOT NULL DEFAULT 30,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS publish_target VARCHAR(32) NOT NULL DEFAULT 'group';
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS group_member_count INT NOT NULL DEFAULT 5;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS week1_target INT NOT NULL DEFAULT 5;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS week2_target INT NOT NULL DEFAULT 10;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS week3_target INT NOT NULL DEFAULT 18;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS week4_target INT NOT NULL DEFAULT 30;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS target_source VARCHAR(32) NOT NULL DEFAULT 'growth_lead_agent';
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS strategy_artifact_id UUID;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS strategy_plan_id UUID;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS target_rationale TEXT;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS target_updated_at TIMESTAMPTZ;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS weekly_targets_json JSONB;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS auto_reply_comments BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS auto_invite_enabled BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS daily_invite_limit INT NOT NULL DEFAULT 12;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS last_comment_sync_at TIMESTAMPTZ;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS last_invite_run_at TIMESTAMPTZ;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS last_group_comment_sync_at TIMESTAMPTZ;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS last_post_stats_sync_at TIMESTAMPTZ;
      ALTER TABLE community_hub_settings ADD COLUMN IF NOT EXISTS fb_admin_name VARCHAR(255);

      CREATE TABLE IF NOT EXISTS community_post_metrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        source_id UUID,
        channel VARCHAR(32) NOT NULL,
        external_post_key VARCHAR(255) NOT NULL,
        post_title VARCHAR(500) NOT NULL DEFAULT '',
        post_url TEXT,
        likes_count INT NOT NULL DEFAULT 0,
        comments_count INT NOT NULL DEFAULT 0,
        shares_count INT NOT NULL DEFAULT 0,
        reactions_breakdown JSONB,
        sync_source VARCHAR(64) NOT NULL DEFAULT 'meta_graph_api',
        published_at TIMESTAMPTZ,
        last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (workspace_id, channel, external_post_key)
      );
      CREATE INDEX IF NOT EXISTS idx_community_post_metrics_ws_ch ON community_post_metrics (workspace_id, channel, last_synced_at DESC);
      CREATE INDEX IF NOT EXISTS idx_community_post_metrics_ws_src ON community_post_metrics (workspace_id, source_id);

      CREATE TABLE IF NOT EXISTS community_post_metric_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        total_posts_tracked INT NOT NULL DEFAULT 0,
        total_likes INT NOT NULL DEFAULT 0,
        total_comments INT NOT NULL DEFAULT 0,
        total_shares INT NOT NULL DEFAULT 0,
        group_likes INT NOT NULL DEFAULT 0,
        group_comments INT NOT NULL DEFAULT 0,
        group_shares INT NOT NULL DEFAULT 0,
        page_likes INT NOT NULL DEFAULT 0,
        page_comments INT NOT NULL DEFAULT 0,
        page_shares INT NOT NULL DEFAULT 0,
        group_members INT NOT NULL DEFAULT 0,
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_community_post_metric_snapshots_ws_time ON community_post_metric_snapshots (workspace_id, captured_at DESC);

      CREATE TABLE IF NOT EXISTS community_member_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        group_member_count INT NOT NULL,
        page_followers_count INT,
        identified_prospects_count INT NOT NULL DEFAULT 0,
        invites_sent_count INT NOT NULL DEFAULT 0,
        replies_sent_count INT NOT NULL DEFAULT 0,
        campaign_week INT NOT NULL DEFAULT 1,
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_community_snapshots_ws_time ON community_member_snapshots (workspace_id, captured_at DESC);

      CREATE TABLE IF NOT EXISTS community_invite_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        target_ref VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        channel VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL,
        detail TEXT,
        invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_community_invite_logs_ws_time ON community_invite_logs (workspace_id, invited_at DESC);
      CREATE INDEX IF NOT EXISTS idx_community_invite_logs_dedup ON community_invite_logs (workspace_id, target_ref, status);
    `);
    if (useSavepoint) {
      await db.query('RELEASE SAVEPOINT sp_community_growth_schema').catch(() => {});
    }
    return true;
  } catch {
    if (useSavepoint) {
      await db.query('ROLLBACK TO SAVEPOINT sp_community_growth_schema').catch(() => {});
    }
    return false;
  }
}

/**
 * Automatically applies Growth Lead Agent's `community_growth_plan` directly onto `community_hub_settings`
 * unless the user explicitly locked manual targets (`target_source = 'locked_manual'`).
 */
export async function applyCommunityGrowthPlan(
  db: DbLike,
  plan: CampaignPlan,
  strategyArtifactId?: string | null,
  options: { inTransaction?: boolean; forceOverrideManual?: boolean } = {},
): Promise<AppliedCommunityPlanResult> {
  const cgp = plan.community_growth_plan;
  if (!cgp) {
    return { applied: false, reason: 'NO_COMMUNITY_GROWTH_PLAN' };
  }

  const schemaOk = await ensureCommunityGrowthSchema(db, { inTransaction: options.inTransaction });
  if (!schemaOk) {
    return { applied: false, reason: 'SCHEMA_UNAVAILABLE' };
  }

  const existing = (
    await db.query<{ target_source?: string | null }>(
      'SELECT target_source FROM community_hub_settings WHERE workspace_id = $1 LIMIT 1',
      [plan.workspace_id],
    )
  ).rows[0];

  if (!existing) {
    // Seed default community hub row so Growth Lead can apply immediately even before Hub UI is opened.
    const defaultGroupUrl = 'https://www.facebook.com/groups/1134282109069209';
    const defaultCommunityName = 'Cộng đồng Du lịch & Sống tại Việt Nam';
    await db.query(
      `INSERT INTO community_hub_settings (
        workspace_id, community_name, group_url, publish_target, page_name, page_url, positioning,
        group_member_count, week1_target, week2_target, week3_target, week4_target,
        target_source, strategy_artifact_id, strategy_plan_id, target_rationale, target_updated_at,
        weekly_targets_json, auto_reply_comments, auto_invite_enabled, daily_invite_limit
      ) VALUES (
        $1, $2, $3, 'group', 'Dịch vụ hỗ trợ du lịch', 'https://www.facebook.com/profile.php?id=61596152213281',
        $4, $5, $6, $7, $8, $9,
        'growth_lead_agent', $10, $11, $12, NOW(),
        $13::jsonb, $14, $15, $16
      ) ON CONFLICT (workspace_id) DO NOTHING`,
      [
        plan.workspace_id,
        defaultCommunityName,
        defaultGroupUrl,
        `Không gian chia sẻ kinh nghiệm Du lịch & Sống tại Việt Nam (${defaultGroupUrl}).`,
        Math.max(0, cgp.current_members),
        cgp.week1_target,
        cgp.week2_target,
        cgp.week3_target,
        cgp.week4_target,
        strategyArtifactId ?? null,
        plan.plan_id,
        cgp.rationale,
        JSON.stringify(cgp.weekly_targets),
        cgp.recommended_auto_reply_comments !== false,
        cgp.recommended_auto_invite_enabled !== false,
        clampDailyInviteLimit(cgp.recommended_daily_invite_limit, 12),
      ],
    );
    return {
      applied: true,
      week1_target: cgp.week1_target,
      week2_target: cgp.week2_target,
      week3_target: cgp.week3_target,
      week4_target: cgp.week4_target,
      daily_invite_limit: clampDailyInviteLimit(cgp.recommended_daily_invite_limit, 12),
    };
  }

  if (!options.forceOverrideManual && existing.target_source === 'locked_manual') {
    return { applied: false, reason: 'LOCKED_MANUAL' };
  }

  const dailyLimit = clampDailyInviteLimit(cgp.recommended_daily_invite_limit, 12);
  await db.query(
    `UPDATE community_hub_settings
        SET week1_target = $2,
            week2_target = $3,
            week3_target = $4,
            week4_target = $5,
            daily_invite_limit = $6,
            target_source = 'growth_lead_agent',
            strategy_artifact_id = COALESCE($7, strategy_artifact_id),
            strategy_plan_id = $8,
            target_rationale = $9,
            weekly_targets_json = $10::jsonb,
            target_updated_at = NOW(),
            updated_at = NOW()
      WHERE workspace_id = $1`,
    [
      plan.workspace_id,
      cgp.week1_target,
      cgp.week2_target,
      cgp.week3_target,
      cgp.week4_target,
      dailyLimit,
      strategyArtifactId ?? null,
      plan.plan_id,
      cgp.rationale,
      JSON.stringify(cgp.weekly_targets),
    ],
  );

  return {
    applied: true,
    week1_target: cgp.week1_target,
    week2_target: cgp.week2_target,
    week3_target: cgp.week3_target,
    week4_target: cgp.week4_target,
    daily_invite_limit: dailyLimit,
  };
}

/**
 * Loads live community summary metrics used as grounded input by Measurement, PlanOutboxRunner, and Growth Lead.
 */
export async function loadCommunityGrowthContext(
  db: DbLike,
  workspaceId: string,
): Promise<{
  group_name?: string;
  current_members: number;
  week1_baseline_members: number | null;
  page_followers: number | null;
  identified_prospects: number;
  invites_sent_7d: number;
  comments_replied_7d: number;
  pending_questions: number;
  current_campaign_week: number;
  daily_invite_cap: number;
  auto_reply_comments: boolean;
  auto_invite_enabled: boolean;
} | null> {
  try {
    const row = (
      await db.query<{
        community_name: string;
        group_member_count: number;
        daily_invite_limit?: number | null;
        auto_reply_comments?: boolean | null;
        auto_invite_enabled?: boolean | null;
        week1_baseline_members: number | null;
        page_followers_count: number | null;
        identified_prospects: number;
        invites_sent_7d: number;
        comments_replied_7d: number;
        pending_questions: number;
      }>(
        `SELECT
           s.community_name,
           s.group_member_count,
           s.daily_invite_limit,
           s.auto_reply_comments,
           s.auto_invite_enabled,
           (SELECT sn.group_member_count FROM community_member_snapshots sn
             WHERE sn.workspace_id = $1 AND sn.campaign_week = 1
             ORDER BY sn.captured_at ASC LIMIT 1) AS week1_baseline_members,
           (SELECT sn2.page_followers_count FROM community_member_snapshots sn2
             WHERE sn2.workspace_id = $1 AND sn2.page_followers_count IS NOT NULL
             ORDER BY sn2.captured_at DESC LIMIT 1) AS page_followers_count,
           (SELECT count(*)::int FROM community_hub_members m WHERE m.workspace_id = $1) AS identified_prospects,
           (SELECT count(*)::int FROM community_invite_logs l
             WHERE l.workspace_id = $1 AND l.status = 'invited' AND l.invited_at >= NOW() - interval '7 days') AS invites_sent_7d,
           (SELECT count(*)::int FROM community_messages cm
             WHERE cm.workspace_id = $1 AND cm.status = 'replied' AND cm.updated_at >= NOW() - interval '7 days') AS comments_replied_7d,
           (SELECT count(*)::int FROM community_messages cm2
             WHERE cm2.workspace_id = $1 AND cm2.status IN ('received', 'queued')) AS pending_questions
         FROM community_hub_settings s
        WHERE s.workspace_id = $1
        LIMIT 1`,
        [workspaceId],
      )
    ).rows[0];

    if (!row) return null;

    return {
      group_name: row.community_name,
      current_members: Math.max(0, Number(row.group_member_count ?? 0)),
      week1_baseline_members:
        row.week1_baseline_members !== null && row.week1_baseline_members !== undefined
          ? Math.max(0, Number(row.week1_baseline_members))
          : null,
      page_followers:
        row.page_followers_count !== null && row.page_followers_count !== undefined
          ? Math.max(0, Number(row.page_followers_count))
          : null,
      identified_prospects: Math.max(0, Number(row.identified_prospects ?? 0)),
      invites_sent_7d: Math.max(0, Number(row.invites_sent_7d ?? 0)),
      comments_replied_7d: Math.max(0, Number(row.comments_replied_7d ?? 0)),
      pending_questions: Math.max(0, Number(row.pending_questions ?? 0)),
      current_campaign_week: currentVietnamCampaignWeek(),
      daily_invite_cap: clampDailyInviteLimit(row.daily_invite_limit, 12),
      auto_reply_comments: row.auto_reply_comments !== false,
      auto_invite_enabled: row.auto_invite_enabled !== false,
    };
  } catch {
    return null;
  }
}

