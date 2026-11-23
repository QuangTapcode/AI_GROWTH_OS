-- ============================================================================
-- AI GROWTH OS — Migration 026: TikTok OAuth Tokens & Option B Video Publishing
-- Target: PostgreSQL 17
-- ============================================================================

CREATE TABLE IF NOT EXISTS tiktok_oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    open_id VARCHAR(128) NOT NULL,
    display_name VARCHAR(255),
    avatar_url TEXT,
    encrypted_access_token TEXT NOT NULL,
    encrypted_refresh_token TEXT,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    expires_at TIMESTAMPTZ NOT NULL,
    refresh_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_tiktok_oauth_tokens_ws
    ON tiktok_oauth_tokens(workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS tiktok_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    caption TEXT NOT NULL,
    hashtags TEXT[] NOT NULL DEFAULT '{}',
    source_artifact_id UUID REFERENCES content_artifacts(id) ON DELETE SET NULL,
    video_source_type VARCHAR(20) NOT NULL CHECK (video_source_type IN ('file_upload', 'url')),
    file_path TEXT,
    file_size_bytes BIGINT,
    media_url TEXT,
    privacy_level VARCHAR(50) NOT NULL DEFAULT 'SELF_ONLY',
    is_aigc BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(30) NOT NULL DEFAULT 'ready'
        CHECK (status IN ('ready', 'scheduled', 'publishing', 'published', 'failed')),
    artifact_id UUID REFERENCES content_artifacts(id) ON DELETE SET NULL,
    publishing_job_id UUID REFERENCES publishing_jobs(id) ON DELETE SET NULL,
    tiktok_publish_id VARCHAR(255),
    error_message TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiktok_videos_ws
    ON tiktok_videos(workspace_id, created_at DESC);

ALTER TABLE publishing_jobs ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE publishing_jobs ADD COLUMN IF NOT EXISTS media_path TEXT;
ALTER TABLE publishing_jobs ADD COLUMN IF NOT EXISTS media_type VARCHAR(20);
ALTER TABLE publishing_jobs ADD COLUMN IF NOT EXISTS custom_caption TEXT;
ALTER TABLE publishing_jobs ADD COLUMN IF NOT EXISTS tiktok_video_id UUID REFERENCES tiktok_videos(id) ON DELETE SET NULL;

