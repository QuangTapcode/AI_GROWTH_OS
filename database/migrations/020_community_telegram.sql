-- 020_community_telegram.sql
-- Cho phép tin nhắn Telegram đi vào Community inbox
ALTER TABLE community_messages DROP CONSTRAINT IF EXISTS community_messages_platform_check;
ALTER TABLE community_messages ADD CONSTRAINT community_messages_platform_check
  CHECK (platform IN ('facebook_comment', 'facebook_message', 'website_comment', 'manual', 'tripc_chat', 'telegram_message'));
