-- ============================================================================
-- AI GROWTH OS — Migration 012: Public Content Performance Index & Artifact Idempotency
-- Target: PostgreSQL 17 + pgvector
-- Owner: Thiệu Quang (Backend Core & Contracts Lead)
-- ============================================================================

-- 1. Partial Composite Index cho Public API truy vấn các bài viết đã xuất bản (status = 'published')
-- Tối ưu hóa truy vấn: WHERE workspace_id = $1 AND status = 'published' AND published_at IS NOT NULL ORDER BY published_at DESC
CREATE INDEX IF NOT EXISTS idx_contents_public_feed
ON contents(workspace_id, published_at DESC)
WHERE status = 'published';

-- 2. Partial Unique Index chống trùng lặp Content Artifacts khi AI hoặc Worker Retry
-- Đảm bảo tính Idempotent trên từng nhiệm vụ và phiên bản: (workspace_id, task_id, version)
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_artifacts_task_version
ON content_artifacts(workspace_id, task_id, version)
WHERE task_id IS NOT NULL;
