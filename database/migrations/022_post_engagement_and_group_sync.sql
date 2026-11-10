-- 022_post_engagement_and_group_sync.sql
-- Tracks real per-post engagement metrics (Likes, Comments, Shares) across Facebook Group & Fanpage,
-- chronological growth + engagement snapshots, and dedicated cooldown/admin identity for Group comment sync.

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

