-- ============================================================================
-- AI GROWTH OS — Migration 001: Initial Core Schema & Tenant Isolation
-- Target: PostgreSQL 17 + pgvector
-- Owner: Thiệu Quang (BE Core)
-- ============================================================================

-- 1. Bật extension pgvector để lưu trữ và tìm kiếm vector RAG (embeddinggemma 768 chiều)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PHẦN 1: IDENTITY, WORKSPACES & PHÂN QUYỀN RBAC (M01)
-- ============================================================================

-- Bảng người dùng hệ thống
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bảng Không gian làm việc (Workspaces / Tenants)
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Bangkok',
    default_language VARCHAR(10) NOT NULL DEFAULT 'en',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bảng Quan hệ Thành viên - Workspace (Xác định Role sản phẩm: Owner / Editor / Viewer)
CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_workspace_user ON memberships(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);

-- Bảng Hồ sơ Doanh nghiệp (Business Profile - Phục vụ TripC và AI context)
CREATE TABLE IF NOT EXISTS business_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    website_url VARCHAR(500),
    industry VARCHAR(100),
    target_locations TEXT[] DEFAULT ARRAY['Da Nang'],
    target_audiences TEXT[] DEFAULT ARRAY['English-speaking expats living or planning to live in Da Nang'],
    products_services TEXT[] DEFAULT ARRAY['housing', 'living_areas', 'coworking', 'gym', 'food', 'events'],
    brand_voice VARCHAR(100) DEFAULT 'helpful, local expert, reliable',
    brand_guidelines TEXT,
    competitors TEXT[],
    version INT NOT NULL DEFAULT 1,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Đảm bảo cột website_url tồn tại nếu bảng đã tạo từ trước
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS website_url VARCHAR(500);

-- ============================================================================
-- PHẦN 2: KNOWLEDGE BASE, VECTOR EMBEDDINGS & NGUỒN TRI THỨC (M02)
-- ============================================================================

-- Bảng Nguồn tài liệu (Text, PDF, URL)
CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('text', 'pdf', 'url')),
    url_or_blob TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    status VARCHAR(30) NOT NULL DEFAULT 'imported' 
        CHECK (status IN ('imported', 'processing', 'needs_review', 'approved', 'rejected', 'revoked', 'deleted')),
    version INT NOT NULL DEFAULT 1,
    content_hash VARCHAR(64),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sources_workspace_status ON sources(workspace_id, status);

-- Bảng Chunks văn bản phục vụ RAG (Vector 768 chiều)
CREATE TABLE IF NOT EXISTS source_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    source_version INT NOT NULL DEFAULT 1,
    chunk_index INT NOT NULL,
    text_content TEXT NOT NULL,
    citation_locator VARCHAR(300), -- Ví dụ: "Trang 2", "Đoạn 3"
    embedding vector(768),         -- Phù hợp model embeddinggemma của Quang Quang
    model VARCHAR(50) DEFAULT 'embeddinggemma',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_workspace_source ON source_chunks(workspace_id, source_id);

-- Index HNSW tăng tốc tìm kiếm tương đồng vector (Cosine similarity)
CREATE INDEX IF NOT EXISTS idx_source_chunks_vector_hnsw 
ON source_chunks USING hnsw (embedding vector_cosine_ops);

-- Bảng Trích xuất Fact nghiệp vụ (Verified Business Facts)
CREATE TABLE IF NOT EXISTS source_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    source_version INT NOT NULL DEFAULT 1,
    fact_key VARCHAR(100) NOT NULL,
    fact_value TEXT NOT NULL,
    unit VARCHAR(50),
    verification_status VARCHAR(20) DEFAULT 'unverified' 
        CHECK (verification_status IN ('unverified', 'verified', 'disputed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facts_workspace ON source_facts(workspace_id);

-- ============================================================================
-- PHẦN 3: GIÁM SÁT HỆ THỐNG & CHỐNG TRÙNG LẶP (Audit & Idempotency)
-- ============================================================================

-- Bảng Nhật ký Kiểm toán (Ai làm gì, lúc nào, trên phiên bản nào)
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    entity_version INT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_workspace_created ON audit_events(workspace_id, created_at DESC);

-- Bảng Chống thực thi trùng lặp (Idempotency Keys cho POST/Retry)
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key VARCHAR(255) NOT NULL,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    response_code INT,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (key, workspace_id, action)
);
