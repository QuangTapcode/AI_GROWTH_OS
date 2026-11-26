-- ============================================================================
-- AI GROWTH OS — Migration 024: Reverse-Connecting GPU Workers & Image Jobs
-- Target: PostgreSQL 17 + Row Level Security (RLS)
-- Reference: Reverse-Connecting GPU Worker Architecture
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BỔ SUNG CÁC CỘT MEDIA_ASSETS CÒN THIẾU (THEO KẾT QUẢ R0 - IDEMPOTENT)
-- ----------------------------------------------------------------------------
ALTER TABLE media_assets
    ADD COLUMN IF NOT EXISTS storage_key TEXT,
    ADD COLUMN IF NOT EXISTS prompt TEXT,
    ADD COLUMN IF NOT EXISTS model_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS seed BIGINT,
    ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10, 4) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS width INTEGER,
    ADD COLUMN IF NOT EXISTS height INTEGER,
    ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE;

-- Cập nhật cờ is_ai_generated nếu chưa có giá trị
UPDATE media_assets
SET is_ai_generated = TRUE
WHERE source_type = 'ai_generated' AND (is_ai_generated IS NULL OR is_ai_generated = FALSE);

-- Đảm bảo tính duy nhất và idempotent khi trùng content_hash trong một workspace
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_assets_workspace_content_hash
    ON media_assets(workspace_id, content_hash)
    WHERE content_hash IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. HÀM VÀ TRIGGER CẬP NHẬT UPDATED_AT TỰ ĐỘNG
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 3. BẢNG QUẢN LÝ TRẠM MÁY GPU (gpu_workers)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gpu_workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'offline'
        CHECK (status IN ('online', 'busy', 'offline', 'disabled')),
    last_seen_at TIMESTAMPTZ,
    worker_version VARCHAR(50),
    engine_version VARCHAR(50),
    model_key VARCHAR(100),
    vram_free_mb INT,
    active_job_id UUID,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gpu_workers_token_hash ON gpu_workers(token_hash);
CREATE INDEX IF NOT EXISTS idx_gpu_workers_status_last_seen ON gpu_workers(status, last_seen_at);

DROP TRIGGER IF EXISTS trg_gpu_workers_updated_at ON gpu_workers;
CREATE TRIGGER trg_gpu_workers_updated_at
    BEFORE UPDATE ON gpu_workers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Bảo vệ gpu_workers: Không lộ qua bất kỳ route nào của tenant
ALTER TABLE gpu_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gpu_workers FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'gpu_workers' AND policyname = 'gpu_workers_worker_only'
    ) THEN
        CREATE POLICY gpu_workers_worker_only ON gpu_workers
            FOR ALL
            USING (current_setting('app.is_worker_context', true) = 'true');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. BẢNG QUẢN LÝ HÀNG ĐỢI & VÒNG ĐỜI TÁC VỤ SINH ẢNH (image_jobs)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS image_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    root_job_id UUID NOT NULL,
    attempt INT NOT NULL DEFAULT 1,
    delivery_count INT NOT NULL DEFAULT 0,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    owner VARCHAR(100) NOT NULL,
    source_ref VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'queued'
        CHECK (status IN (
            'queued', 'claimed', 'running', 'uploaded', 
            'reviewing', 'completed', 'failed', 'needs_assets', 'cancelled'
        )),
    request JSONB NOT NULL,
    claimed_by UUID REFERENCES gpu_workers(id) ON DELETE SET NULL,
    lease_expires_at TIMESTAMPTZ,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    result_storage_key TEXT,
    result_sha256 VARCHAR(64),
    provider_used VARCHAR(50) DEFAULT 'gpu_worker',
    error_code VARCHAR(100),
    error_message TEXT,
    media_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chỉ mục bắt buộc theo yêu cầu: (status, queued_at) và (lease_expires_at)
CREATE INDEX IF NOT EXISTS idx_image_jobs_status_queued_at ON image_jobs(status, queued_at);
CREATE INDEX IF NOT EXISTS idx_image_jobs_lease_expires_at ON image_jobs(lease_expires_at);

-- Chỉ mục hỗ trợ
CREATE INDEX IF NOT EXISTS idx_image_jobs_workspace_status ON image_jobs(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_image_jobs_root ON image_jobs(root_job_id, attempt);
CREATE INDEX IF NOT EXISTS idx_image_jobs_result_sha256 ON image_jobs(result_sha256) WHERE result_sha256 IS NOT NULL;

-- Trigger updated_at cho image_jobs
DROP TRIGGER IF EXISTS trg_image_jobs_updated_at ON image_jobs;
CREATE TRIGGER trg_image_jobs_updated_at
    BEFORE UPDATE ON image_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Khóa ngoại vòng tròn từ gpu_workers trỏ tới image_jobs(id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_gpu_workers_active_job' AND table_name = 'gpu_workers'
    ) THEN
        ALTER TABLE gpu_workers
            ADD CONSTRAINT fk_gpu_workers_active_job
            FOREIGN KEY (active_job_id) REFERENCES image_jobs(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) FOR MULTI-TENANT ISOLATION
-- ----------------------------------------------------------------------------
ALTER TABLE image_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_jobs FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'image_jobs' AND policyname = 'image_jobs_tenant_isolation'
    ) THEN
        CREATE POLICY image_jobs_tenant_isolation ON image_jobs
            FOR ALL
            USING (
                (
                    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
                    AND current_setting('app.current_workspace_id', true) IS NOT NULL
                )
                OR current_setting('app.is_worker_context', true) = 'true'
            );
    END IF;
END $$;
