-- ============================================================================
-- AI GROWTH OS — Migration 024 Down: Rollback GPU Workers & Image Jobs
-- ============================================================================

DROP TRIGGER IF EXISTS trg_image_jobs_updated_at ON image_jobs;
DROP TRIGGER IF EXISTS trg_gpu_workers_updated_at ON gpu_workers;

ALTER TABLE IF EXISTS gpu_workers DROP CONSTRAINT IF EXISTS fk_gpu_workers_active_job;
DROP TABLE IF EXISTS image_jobs CASCADE;
DROP TABLE IF EXISTS gpu_workers CASCADE;

-- Revert added columns in media_assets if required
DROP INDEX IF EXISTS uq_media_assets_workspace_content_hash;
ALTER TABLE IF EXISTS media_assets
    DROP COLUMN IF EXISTS storage_key,
    DROP COLUMN IF EXISTS prompt,
    DROP COLUMN IF EXISTS model_name,
    DROP COLUMN IF EXISTS seed,
    DROP COLUMN IF EXISTS cost_usd,
    DROP COLUMN IF EXISTS width,
    DROP COLUMN IF EXISTS height,
    DROP COLUMN IF EXISTS is_ai_generated;
