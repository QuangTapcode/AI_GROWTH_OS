-- 020_community_telegram.down.sql
DELETE FROM community_messages WHERE platform = 'telegram_message';
ALTER TABLE community_messages DROP CONSTRAINT IF EXISTS community_messages_platform_check;
ALTER TABLE community_messages ADD CONSTRAINT community_messages_platform_check
  CHECK (platform IN ('facebook_comment', 'facebook_message', 'website_comment', 'manual', 'tripc_chat'));
