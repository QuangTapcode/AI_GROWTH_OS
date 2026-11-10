-- 022_post_engagement_and_group_sync.down.sql
DROP TABLE IF EXISTS community_post_metric_snapshots CASCADE;
DROP TABLE IF EXISTS community_post_metrics CASCADE;
ALTER TABLE IF EXISTS community_hub_settings DROP COLUMN IF EXISTS fb_admin_name;
ALTER TABLE IF EXISTS community_hub_settings DROP COLUMN IF EXISTS last_post_stats_sync_at;
ALTER TABLE IF EXISTS community_hub_settings DROP COLUMN IF EXISTS last_group_comment_sync_at;

