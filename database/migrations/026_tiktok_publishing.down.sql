ALTER TABLE publishing_jobs DROP COLUMN IF EXISTS tiktok_video_id;
ALTER TABLE publishing_jobs DROP COLUMN IF EXISTS custom_caption;
ALTER TABLE publishing_jobs DROP COLUMN IF EXISTS media_type;
ALTER TABLE publishing_jobs DROP COLUMN IF EXISTS media_path;
ALTER TABLE publishing_jobs DROP COLUMN IF EXISTS media_url;

DROP INDEX IF EXISTS idx_tiktok_videos_ws;
DROP TABLE IF EXISTS tiktok_videos CASCADE;

DROP INDEX IF EXISTS idx_tiktok_oauth_tokens_ws;
DROP TABLE IF EXISTS tiktok_oauth_tokens CASCADE;

