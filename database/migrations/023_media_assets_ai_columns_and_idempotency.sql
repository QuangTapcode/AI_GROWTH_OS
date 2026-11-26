-- ============================================================================
-- AI GROWTH OS — Migration 023: Media Assets AI Metadata Columns & Idempotency
-- Target: PostgreSQL 17 + Row Level Security (RLS)
-- Architecture: Dual-Asset Management & AI Image Generation Ledger (CM-11)
-- ============================================================================

-- 1. Add dedicated columns for AI generation metadata and storage tracking
ALTER TABLE media_assets
    ADD COLUMN IF NOT EXISTS storage_key TEXT,
    ADD COLUMN IF NOT EXISTS prompt TEXT,
    ADD COLUMN IF NOT EXISTS model_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS seed BIGINT,
    ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10, 4) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS width INTEGER,
    ADD COLUMN IF NOT EXISTS height INTEGER,
    ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE;

-- 2. Backfill is_ai_generated based on source_type
UPDATE media_assets
SET is_ai_generated = TRUE
WHERE source_type = 'ai_generated' AND (is_ai_generated IS NULL OR is_ai_generated = FALSE);

-- 3. Enforce idempotency: prevent duplicate asset rows for the same image content within a workspace
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_assets_workspace_content_hash
    ON media_assets(workspace_id, content_hash)
    WHERE content_hash IS NOT NULL;

