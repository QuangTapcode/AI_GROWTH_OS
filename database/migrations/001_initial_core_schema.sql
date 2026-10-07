-- ============================================================================
-- AI GROWTH OS — Migration 001: Initial Core Schema & Tenant Isolation
-- Target: PostgreSQL 17 + pgvector (embeddinggemma 768 dimensions)
-- Architecture: Multi-tenant RBAC Isolation + Full Business Domain Schema
-- ============================================================================

-- 1. Bật extension pgvector để lưu trữ và tìm kiếm vector RAG (embeddinggemma 768 chiều)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PHẦN 1: IDENTITY, WORKSPACES & PHÂN QUYỀN RBAC (M01 - CỐT LÕI BẢO MẬT)
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

-- Bảng Quan hệ Thành viên - Workspace (Xác định Role RBAC: Owner / Editor / Viewer)
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
    overview TEXT,
    safety_rules JSONB DEFAULT '{"no_hallucinate_pricing": true, "no_hallucinate_address": true}'::jsonb,
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

-- Đảm bảo tương thích ngược nếu bảng đã được tạo trước đó
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS website_url VARCHAR(500);
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS overview TEXT;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS safety_rules JSONB DEFAULT '{"no_hallucinate_pricing": true, "no_hallucinate_address": true}'::jsonb;

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

-- Bảng Chunks văn bản phục vụ RAG (Vector 768 chiều tương thích Ollama embeddinggemma)
CREATE TABLE IF NOT EXISTS source_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    source_version INT NOT NULL DEFAULT 1,
    chunk_index INT NOT NULL,
    text_content TEXT NOT NULL,
    citation_locator VARCHAR(300),
    embedding vector(768),
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
-- PHẦN 3: BRAND PROFILE, SẢN PHẨM, KHÁCH HÀNG & ĐỊA ĐIỂM (BỔ SUNG TỪ MỸ)
-- ============================================================================

CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    brand_voice TEXT,
    tone VARCHAR(100),
    guidelines_text TEXT,
    forbidden_terms TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price_info JSONB,
    usps TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    target_persona TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    city VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Vietnam',
    is_primary BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS audiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    demographics JSONB,
    pain_points TEXT[],
    interests TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    brand_name VARCHAR(150),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PHẦN 4: CHIẾN LƯỢC TĂNG TRƯỞNG & CƠ HỘI (GROWTH STRATEGY & OPPORTUNITIES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS growth_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    target_traffic_pct NUMERIC(5,2),
    target_qualified_visits INT,
    period_days INT DEFAULT 90,
    primary_conversion VARCHAR(50) DEFAULT 'signup',
    budget_usd NUMERIC(10,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS growth_kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES growth_goals(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    baseline_value NUMERIC(12,2),
    target_value NUMERIC(12,2),
    current_value NUMERIC(12,2) DEFAULT 0.00
);

CREATE TABLE IF NOT EXISTS growth_strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES growth_goals(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    period_range DATERANGE,
    strategy_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS growth_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    strategy_id UUID REFERENCES growth_strategies(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    keyword VARCHAR(255),
    search_intent VARCHAR(50) DEFAULT 'commercial',
    audience_id UUID REFERENCES audiences(id) ON DELETE SET NULL,
    demand_score NUMERIC(5,2) DEFAULT 0.00,
    competition_score NUMERIC(5,2) DEFAULT 0.00,
    business_value_score NUMERIC(5,2) DEFAULT 0.00,
    freshness_score NUMERIC(5,2) DEFAULT 0.00,
    priority VARCHAR(10) DEFAULT 'P1',
    status VARCHAR(50) DEFAULT 'discovered',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opps_workspace_status ON growth_opportunities(workspace_id, status);

-- ============================================================================
-- PHẦN 5: THỊ TRƯỜNG, XU HƯỚNG & SEO (INTELLIGENCE & SEO ENGINE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS research_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    raw_payload JSONB,
    summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    trend_name VARCHAR(255) NOT NULL,
    velocity_score NUMERIC(5,2),
    first_detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS keyword_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    cluster_name VARCHAR(255) NOT NULL,
    pillar_topic VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    cluster_id UUID REFERENCES keyword_clusters(id) ON DELETE SET NULL,
    keyword_text VARCHAR(255) NOT NULL,
    search_volume INT DEFAULT 0,
    difficulty NUMERIC(5,2),
    intent VARCHAR(50),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competitor_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    page_title VARCHAR(255),
    estimated_traffic INT,
    ranking_keywords TEXT[]
);

-- ============================================================================
-- PHẦN 6: CONTENT PIPELINE & ĐA KÊNH PHÂN PHỐI (CONTENT & DISTRIBUTION)
-- ============================================================================

CREATE TABLE IF NOT EXISTS content_ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    opportunity_id UUID REFERENCES growth_opportunities(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    angle TEXT,
    status VARCHAR(50) DEFAULT 'backlog'
);

CREATE TABLE IF NOT EXISTS content_briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES growth_opportunities(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    primary_keyword VARCHAR(255),
    secondary_keywords TEXT[],
    search_intent VARCHAR(50),
    target_audience TEXT,
    pain_point TEXT,
    unique_angle TEXT,
    call_to_action TEXT,
    facts_to_include TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    brief_id UUID REFERENCES content_briefs(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    body_markdown TEXT,
    type VARCHAR(50) DEFAULT 'article',
    status VARCHAR(50) DEFAULT 'draft',
    content_score NUMERIC(5,2) DEFAULT 0.00,
    seo_score NUMERIC(5,2) DEFAULT 0.00,
    business_value NUMERIC(5,2) DEFAULT 0.00,
    created_by VARCHAR(50) DEFAULT 'ai',
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contents_workspace_status ON contents(workspace_id, status);

CREATE TABLE IF NOT EXISTS content_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL,
    body_text TEXT NOT NULL,
    hook_text TEXT,
    cta_override TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    asset_type VARCHAR(50),
    asset_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SEO Pages, Audits, Internal Links & Rankings
CREATE TABLE IF NOT EXISTS seo_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    slug VARCHAR(255) NOT NULL,
    meta_title VARCHAR(255),
    meta_description TEXT,
    canonical_url TEXT,
    is_indexed BOOLEAN DEFAULT FALSE,
    last_crawled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS seo_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seo_page_id UUID NOT NULL REFERENCES seo_pages(id) ON DELETE CASCADE,
    health_score NUMERIC(5,2),
    issues JSONB,
    audited_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS internal_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_page_id UUID NOT NULL REFERENCES seo_pages(id) ON DELETE CASCADE,
    target_page_id UUID NOT NULL REFERENCES seo_pages(id) ON DELETE CASCADE,
    anchor_text VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seo_keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seo_page_id UUID NOT NULL REFERENCES seo_pages(id) ON DELETE CASCADE,
    keyword_id UUID NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword_id UUID NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
    rank_position INT NOT NULL,
    date DATE NOT NULL,
    url_found TEXT
);

-- Phân phối Đa kênh & Tự động xuất bản
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    platform_name VARCHAR(50) NOT NULL,
    channel_identifier VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    account_name VARCHAR(255),
    oauth_token_encrypted TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS publishing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    scheduled_for TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'scheduled',
    utm_url TEXT,
    external_post_id VARCHAR(255),
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_publishing_jobs_status_date ON publishing_jobs(status, scheduled_for);

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    utm_campaign VARCHAR(100) NOT NULL,
    start_date DATE,
    end_date DATE
);

CREATE TABLE IF NOT EXISTS community_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    platform VARCHAR(50),
    thread_title TEXT,
    thread_url TEXT,
    intent_category VARCHAR(100),
    intent_score NUMERIC(5,2),
    status VARCHAR(50) DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS community_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_opportunity_id UUID NOT NULL REFERENCES community_opportunities(id) ON DELETE CASCADE,
    suggested_response TEXT NOT NULL,
    human_approved BOOLEAN DEFAULT FALSE,
    posted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS traffic_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_name VARCHAR(100),
    channel_type VARCHAR(50)
);

-- ============================================================================
-- PHẦN 7: ĐO LƯỜNG HIỆU QUẢ, CHUYỂN ĐỔI & THỬ NGHIỆM A/B
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    content_id UUID REFERENCES contents(id) ON DELETE SET NULL,
    event_name VARCHAR(100) NOT NULL,
    session_id VARCHAR(100),
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_content ON analytics_events(content_id, created_at);

CREATE TABLE IF NOT EXISTS content_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    impressions INT DEFAULT 0,
    clicks INT DEFAULT 0,
    ctr NUMERIC(5,2) DEFAULT 0.00,
    organic_traffic INT DEFAULT 0,
    signups INT DEFAULT 0,
    revenue NUMERIC(10,2) DEFAULT 0.00
);

CREATE TABLE IF NOT EXISTS conversion_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    content_id UUID REFERENCES contents(id) ON DELETE SET NULL,
    conversion_type VARCHAR(50) NOT NULL,
    attributed_value NUMERIC(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    experiment_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS experiment_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    variant_name VARCHAR(10) NOT NULL,
    variant_content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experiment_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID NOT NULL REFERENCES experiment_variants(id) ON DELETE CASCADE,
    impressions INT DEFAULT 0,
    conversions INT DEFAULT 0,
    conversion_rate NUMERIC(5,2) DEFAULT 0.00,
    is_winner BOOLEAN DEFAULT FALSE
);

-- ============================================================================
-- PHẦN 8: AI AGENTS, RUNS & TASK EXECUTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name VARCHAR(100) UNIQUE NOT NULL,
    role_description TEXT,
    system_prompt TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    triggered_by VARCHAR(50) DEFAULT 'cron',
    status VARCHAR(50) DEFAULT 'running',
    execution_time_ms INT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    task_code VARCHAR(50) NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    payload JSONB,
    status VARCHAR(50) DEFAULT 'queued',
    confidence_score NUMERIC(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_queue ON agent_tasks(workspace_id, status);

-- ============================================================================
-- PHẦN 9: THÔNG BÁO & TIỆN ÍCH (NOTIFICATIONS & USAGE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    plan_tier VARCHAR(50) DEFAULT 'starter',
    status VARCHAR(50) DEFAULT 'active',
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    tokens_consumed INT DEFAULT 0,
    credits_remaining INT DEFAULT 10000,
    period_date DATE NOT NULL
);

-- ============================================================================
-- PHẦN 10: GIÁM SÁT HỆ THỐNG & CHỐNG TRÙNG LẶP (AUDIT & IDEMPOTENCY - CỐT LÕI)
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
