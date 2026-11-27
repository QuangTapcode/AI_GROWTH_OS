-- ============================================================================
-- AI GROWTH OS — Migration 023 Rollback: Media Assets AI Metadata Columns
-- ============================================================================

DROP INDEX IF EXISTS uq_media_assets_workspace_content_hash;

ALTER TABLE media_assets
    DROP COLUMN IF EXISTS is_ai_generated,
    DROP COLUMN IF EXISTS height,
    DROP COLUMN IF EXISTS width,
    DROP COLUMN IF EXISTS cost_usd,
    DROP COLUMN IF EXISTS seed,
    DROP COLUMN IF EXISTS model_name,
    DROP COLUMN IF EXISTS prompt,
    DROP COLUMN IF EXISTS storage_key;

