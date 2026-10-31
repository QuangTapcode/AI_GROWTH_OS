-- ============================================================================
-- AI GROWTH OS — Migration 018: Media Assets & Dual-Asset Governance (CM-03)
-- Target: PostgreSQL 17 + Row Level Security (RLS)
-- Architecture: Dual-Asset Management (Real Enterprise Assets vs AI Graphics)
-- Owner: AI/Backend Core
-- ============================================================================

CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('real_asset', 'ai_generated')),
    url TEXT NOT NULL,
    license VARCHAR(200) NOT NULL,
    attribution VARCHAR(300) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'rejected')),
    content_hash VARCHAR(64),
    alt_text TEXT,
    ai_metadata JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performant multi-tenant isolation and queries
CREATE INDEX IF NOT EXISTS idx_media_assets_workspace ON media_assets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_status ON media_assets(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_media_assets_type ON media_assets(workspace_id, source_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_hash ON media_assets(workspace_id, content_hash);

-- Row Level Security (RLS) Enforcement
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'media_assets' AND policyname = 'media_assets_tenant_isolation'
    ) THEN
        CREATE POLICY media_assets_tenant_isolation ON media_assets
            FOR ALL
            USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);
    END IF;
END $$;
