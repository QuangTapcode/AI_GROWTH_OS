-- 021_community_growth_targets_and_logs.down.sql
DROP TABLE IF EXISTS community_invite_logs CASCADE;
DROP TABLE IF EXISTS community_member_snapshots CASCADE;
ALTER TABLE IF EXISTS community_hub_settings DROP COLUMN IF EXISTS last_invite_run_at;
ALTER TABLE IF EXISTS community_hub_settings DROP COLUMN IF EXISTS last_comment_sync_at;
ALTER TABLE IF EXISTS community_hub_settings DROP COLUMN IF EXISTS daily_invite_limit;
ALTER TABLE IF EXISTS community_hub_settings DROP COLUMN IF EXISTS auto_invite_enabled;
ALTER TABLE IF EXISTS community_hub_settings DROP COLUMN IF EXISTS auto_reply_comments;
ALTER TABLE IF EXISTS community_hub_settings DROP COLUMN IF EXISTS weekly_targets_json;
ALTER TABLE IF EXISTS community_hub_settings DROP COLUMN IF EXISTS target_updated_at;
ALTER TABLE IF EXISTS community_hub_settings DROP COLUMN IF EXISTS target_rationale;
ALTER TABLE IF EXISTS community_hub_settings DROP COLUMN IF EXISTS strategy_plan_id;
ALTER TABLE IF EXISTS community_hub_settings DROP COLUMN IF EXISTS strategy_artifact_id;
ALTER TABLE IF EXISTS community_hub_settings DROP COLUMN IF EXISTS target_source;
