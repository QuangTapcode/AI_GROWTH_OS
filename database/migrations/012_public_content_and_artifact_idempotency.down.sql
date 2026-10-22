-- ============================================================================
-- Rollback Migration 012: Public Content Performance Index & Artifact Idempotency
-- ============================================================================

DROP INDEX IF EXISTS idx_contents_public_feed;
DROP INDEX IF EXISTS uq_content_artifacts_task_version;
