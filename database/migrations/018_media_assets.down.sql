-- ============================================================================
-- AI GROWTH OS — Migration 012 ROLLBACK: Revert Media Assets & Dual-Asset Governance (CM-03)
-- Target: PostgreSQL 17 + Row Level Security (RLS)
-- Architecture: Clean rollback for media_assets table and RLS policies
-- Owner: AI/Backend Core
-- ============================================================================

-- 1. Drop RLS Policy
DROP POLICY IF EXISTS media_assets_tenant_isolation ON media_assets;

-- 2. Drop Indexes (dropped automatically with table CASCADE, but explicit for clarity)
DROP INDEX IF EXISTS idx_media_assets_hash;
DROP INDEX IF EXISTS idx_media_assets_type;
DROP INDEX IF EXISTS idx_media_assets_status;
DROP INDEX IF EXISTS idx_media_assets_workspace;

-- 3. Drop Table
DROP TABLE IF EXISTS media_assets CASCADE;
