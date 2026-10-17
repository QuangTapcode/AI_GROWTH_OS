-- ==============================================================================
-- Migration: 004_reports_exceptions_outbox.sql
-- Description: Schema for Metric Snapshots, Exceptions with Owners, and Transactional Outbox
-- Sprint: Week 3 - Day 12 (TQ-07 / MY-07)
-- Owner: Thiệu Quang (Backend Core & Contracts Lead)
-- Reviewers: Mỹ + Thiệu
-- ==============================================================================

-- 1. Bảng lưu trữ Snapshot số liệu hiệu quả (Real Metrics Snapshots)
CREATE TABLE IF NOT EXISTS metrics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    period_from DATE NOT NULL,
    period_to DATE NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Bang_Chi_Minh',
    currency VARCHAR(10) NOT NULL DEFAULT 'VND',
    metric_value NUMERIC(14, 4),
    availability VARCHAR(50) NOT NULL CHECK (availability IN ('available', 'missing', 'partial', 'delayed')),
    missing_reason VARCHAR(100),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_snapshots_lookup 
ON metrics_snapshots(workspace_id, provider, metric_name, period_from, period_to);

-- 2. Bảng quản lý Ngoại lệ / Sự cố có Người phụ trách (Exceptions with Owner)
CREATE TABLE IF NOT EXISTS system_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    source_task_id UUID,
    assigned_owner UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'ignored')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_system_exceptions_workspace 
ON system_exceptions(workspace_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_system_exceptions_owner 
ON system_exceptions(workspace_id, assigned_owner);

-- 3. Bảng Transactional Outbox (Chống trùng lặp và nhất quán sự kiện cho 6 Agent)
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    dedup_key VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'published', 'failed')),
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    CONSTRAINT uq_outbox_workspace_dedup UNIQUE (workspace_id, dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_status 
ON outbox_events(workspace_id, status, created_at);
