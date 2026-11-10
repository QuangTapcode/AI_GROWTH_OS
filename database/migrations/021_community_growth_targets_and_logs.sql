-- 021_community_growth_targets_and_logs.sql
-- Growth Lead -> Community Hub automatic target syncing, historical member snapshots,
-- comment auto-reply controls, and safe native invite audit/quota logs.

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

