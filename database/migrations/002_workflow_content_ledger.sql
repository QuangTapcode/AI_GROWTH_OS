-- ============================================================================
-- AI GROWTH OS — Migration 002: Workflow Tasks, Content Ledger & Approvals
-- Target: PostgreSQL 17 + pgvector
-- Architecture: 6-Agent Workflow Pipeline, Content Ledger, Versioning & OCC Approvals
-- Owner: Thiệu Quang (Backend Core & Contracts Lead)
-- ============================================================================

-- ============================================================================
-- PHẦN 1: WORKFLOW ENGINE — TÁC VỤ & ĐỒ THỊ PHỤ THUỘC (6-AGENT PIPELINE)
-- ============================================================================

-- 1.1. Bảng Nhiệm vụ Workflow (Quản lý các bước chạy của 6 AI Agents)
CREATE TABLE IF NOT EXISTS workflow_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('research', 'growth_lead', 'seo', 'content', 'community', 'performance')),
    operation VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'queued', 'running', 'completed', 'failed', 'awaiting_approval', 'cancelled')),
    priority INT NOT NULL DEFAULT 3,
    input_version INT NOT NULL DEFAULT 1,
    context_snapshot_id UUID,
    payload JSONB DEFAULT '{}'::jsonb,
    result_ref UUID,
    error_details JSONB,
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 2,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_ws_status ON workflow_tasks(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_role ON workflow_tasks(workspace_id, role, status);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_campaign ON workflow_tasks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_snapshot ON workflow_tasks(context_snapshot_id);

-- 1.2. Bảng Quan hệ Phụ thuộc Tác vụ (DAG Dependency Graph)
CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id UUID NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (task_id, depends_on_task_id),
    CONSTRAINT check_no_self_dependency CHECK (task_id != depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_deps_depends_on ON task_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_workspace ON task_dependencies(workspace_id);

-- ============================================================================
-- PHẦN 2: CONTENT LEDGER & ARTIFACTS — SỔ CÁI NỘI DUNG & TRÍCH DẪN BẰNG CHỨNG
-- ============================================================================

-- 2.1. Bảng Artifacts đầu ra của các Agent Pipeline (Research Brief, Plan, SEO Article, etc.)
CREATE TABLE IF NOT EXISTS content_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    task_id UUID REFERENCES workflow_tasks(id) ON DELETE SET NULL,
    version INT NOT NULL DEFAULT 1,
    content_hash VARCHAR(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    context_snapshot_id UUID,
    role VARCHAR(50) NOT NULL CHECK (role IN ('research', 'growth_lead', 'seo', 'content', 'community', 'performance')),
    operation VARCHAR(100) NOT NULL,
    artifact_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    storage VARCHAR(50) NOT NULL DEFAULT 'postgres_ledger' CHECK (storage IN ('ai_run_store', 'postgres_ledger')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artifacts_ws_role ON content_artifacts(workspace_id, role, version);
CREATE INDEX IF NOT EXISTS idx_artifacts_task ON content_artifacts(task_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_hash ON content_artifacts(workspace_id, content_hash);

-- 2.2. Bổ sung liên kết Artifact và Versioning cho bảng contents hiện có (Migration 001)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS current_version INT NOT NULL DEFAULT 1;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
ALTER TABLE contents ADD COLUMN IF NOT EXISTS context_snapshot_id UUID;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS artifact_id UUID REFERENCES content_artifacts(id) ON DELETE SET NULL;

-- 2.3. Bảng Lịch sử Phiên bản Nội dung (Content Version History & Stale Detection)
CREATE TABLE IF NOT EXISTS content_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    version INT NOT NULL DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    body_markdown TEXT,
    content_hash VARCHAR(64) CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
    evidence JSONB DEFAULT '[]'::jsonb,
    created_by VARCHAR(50) DEFAULT 'ai',
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_content_versions_content_version UNIQUE (content_id, version)
);

CREATE INDEX IF NOT EXISTS idx_content_versions_ws ON content_versions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_content_versions_content ON content_versions(content_id);

-- ============================================================================
-- PHẦN 3: HUMAN APPROVAL LEDGER — CỔNG PHÊ DUYỆT CỦA CON NGƯỜI & AUDIT TRAIL
-- ============================================================================

-- 3.1. Bảng Phê duyệt Kiểm soát Đồng thời Lạc quan (OCC Approvals)
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('source', 'content', 'artifact', 'task', 'campaign')),
    target_id UUID NOT NULL,
    target_version INT NOT NULL DEFAULT 1,
    target_hash VARCHAR(64) NOT NULL CHECK (target_hash ~ '^[a-f0-9]{64}$'),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
    decision VARCHAR(50) CHECK (decision IN ('approve', 'reject', 'revoke')),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role VARCHAR(20) CHECK (actor_role IN ('owner', 'editor')),
    review_note TEXT,
    invalidated_reason VARCHAR(100),
    invalidated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_target ON approvals(workspace_id, target_type, target_id, target_version);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_actor ON approvals(actor_id);
