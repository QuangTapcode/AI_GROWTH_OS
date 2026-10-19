-- ============================================================================
-- AI GROWTH OS — Migration 006: Auth sessions & distribution scheduling
-- Target: PostgreSQL 17
-- 1. auth_sessions: phiên đăng nhập phía server để logout/đổi mật khẩu thu hồi được token.
-- 2. channels/publishing_jobs (001): thêm workspace scope, liên kết artifact + approval đã duyệt.
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    ip VARCHAR(64),
    user_agent VARCHAR(300)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active ON auth_sessions(user_id) WHERE revoked_at IS NULL;

ALTER TABLE channels ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
ALTER TABLE channels ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_channels_workspace ON channels(workspace_id);

ALTER TABLE publishing_jobs ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE publishing_jobs ADD COLUMN IF NOT EXISTS artifact_id UUID REFERENCES content_artifacts(id) ON DELETE SET NULL;
ALTER TABLE publishing_jobs ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES approvals(id) ON DELETE SET NULL;
ALTER TABLE publishing_jobs ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'manual';
ALTER TABLE publishing_jobs ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE publishing_jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Cùng một artifact không được xếp lịch 2 lần trên cùng channel khi job còn hiệu lực
CREATE UNIQUE INDEX IF NOT EXISTS uq_publishing_jobs_active
ON publishing_jobs(channel_id, artifact_id)
WHERE status IN ('scheduled', 'publishing');

CREATE INDEX IF NOT EXISTS idx_publishing_jobs_workspace ON publishing_jobs(workspace_id, scheduled_for DESC);
