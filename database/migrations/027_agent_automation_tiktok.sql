-- 027_agent_automation_tiktok.sql
-- Opt-in TikTok auto-publishing toggle on agent_automation; auto-enable for workspaces that already connected TikTok.

ALTER TABLE agent_automation
  ADD COLUMN IF NOT EXISTS auto_publish_tiktok BOOLEAN NOT NULL DEFAULT false;

UPDATE agent_automation a
   SET auto_publish_tiktok = true
 WHERE EXISTS (
   SELECT 1 FROM tiktok_oauth_tokens t WHERE t.workspace_id = a.workspace_id
 );
