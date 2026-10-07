-- =============================================================================
-- POSTGRESQL SCHEMA & SEED DATA: AI GROWTH OS (FULL 52 TABLES)
-- =============================================================================

-- 1. BẬT EXTENSION TẠO UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- -----------------------------------------------------------------------------
-- NHÓM 1: MULTI-TENANCY & WORKSPACES (MODULE 1 & 2)
-- -----------------------------------------------------------------------------

-- 1. organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(150),
    role VARCHAR(50) DEFAULT 'growth_manager',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. workspaces
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    website_url TEXT,
    primary_language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. brands
CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    brand_voice TEXT,
    tone VARCHAR(100),
    guidelines_text TEXT,
    forbidden_terms TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. business_profiles
CREATE TABLE business_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    industry VARCHAR(100),
    overview TEXT,
    safety_rules JSONB DEFAULT '{"no_hallucinate_pricing": true, "no_hallucinate_address": true}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. products
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price_info JSONB,
    usps TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. services
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    target_persona TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. locations
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    city VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Vietnam',
    is_primary BOOLEAN DEFAULT false
);

-- 9. audiences
CREATE TABLE audiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    demographics JSONB,
    pain_points TEXT[],
    interests TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. competitors
CREATE TABLE competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    brand_name VARCHAR(150),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- NHÓM 2: KNOWLEDGE BASE (MODULE 2)
-- -----------------------------------------------------------------------------

-- 47. knowledge_documents
CREATE TABLE knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    category VARCHAR(50),
    file_name VARCHAR(255),
    source_url TEXT,
    verification_status VARCHAR(50) DEFAULT 'imported',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 48. knowledge_chunks
CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- NHÓM 3: GROWTH GOALS & STRATEGY (MODULE 3, 5, 6)
-- -----------------------------------------------------------------------------

-- 11. growth_goals
CREATE TABLE growth_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    target_traffic_pct NUMERIC(5,2),
    target_qualified_visits INT,
    period_days INT DEFAULT 90,
    primary_conversion VARCHAR(50) DEFAULT 'signup',
    budget_usd NUMERIC(10,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. growth_kpis
CREATE TABLE growth_kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID REFERENCES growth_goals(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    baseline_value NUMERIC(12,2),
    target_value NUMERIC(12,2),
    current_value NUMERIC(12,2) DEFAULT 0.00
);

-- 13. growth_strategies
CREATE TABLE growth_strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID REFERENCES growth_goals(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    period_range DATERANGE,
    strategy_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 14. growth_opportunities
CREATE TABLE growth_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    strategy_id UUID REFERENCES growth_strategies(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    keyword VARCHAR(255),
    search_intent VARCHAR(50) DEFAULT 'commercial',
    audience_id UUID REFERENCES audiences(id),
    demand_score NUMERIC(5,2) DEFAULT 0.00,
    competition_score NUMERIC(5,2) DEFAULT 0.00,
    business_value_score NUMERIC(5,2) DEFAULT 0.00,
    freshness_score NUMERIC(5,2) DEFAULT 0.00,
    priority VARCHAR(10) DEFAULT 'P1',
    status VARCHAR(50) DEFAULT 'discovered',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- NHÓM 4: MARKET INTELLIGENCE & SEO (MODULE 4, 9)
-- -----------------------------------------------------------------------------

-- 15. sources
CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    source_type VARCHAR(50),
    source_uri TEXT,
    last_fetched_at TIMESTAMPTZ
);

-- 16. research_items
CREATE TABLE research_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
    raw_payload JSONB,
    summary TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 17. trends
CREATE TABLE trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    trend_name VARCHAR(255) NOT NULL,
    velocity_score NUMERIC(5,2),
    first_detected_at TIMESTAMPTZ DEFAULT now()
);

-- 19. keyword_clusters
CREATE TABLE keyword_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    cluster_name VARCHAR(255) NOT NULL,
    pillar_topic VARCHAR(255)
);

-- 18. keywords
CREATE TABLE keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    cluster_id UUID REFERENCES keyword_clusters(id) ON DELETE SET NULL,
    keyword_text VARCHAR(255) NOT NULL,
    search_volume INT DEFAULT 0,
    difficulty NUMERIC(5,2),
    intent VARCHAR(50),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 20. competitor_pages
CREATE TABLE competitor_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    page_title VARCHAR(255),
    estimated_traffic INT,
    ranking_keywords TEXT[]
);

-- -----------------------------------------------------------------------------
-- NHÓM 5: CONTENT PIPELINE (MODULE 7 & 8)
-- -----------------------------------------------------------------------------

-- 21. content_ideas
CREATE TABLE content_ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    opportunity_id UUID REFERENCES growth_opportunities(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    angle TEXT,
    status VARCHAR(50) DEFAULT 'backlog'
);

-- 22. content_briefs
CREATE TABLE content_briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID REFERENCES growth_opportunities(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    primary_keyword VARCHAR(255),
    secondary_keywords TEXT[],
    search_intent VARCHAR(50),
    target_audience TEXT,
    pain_point TEXT,
    unique_angle TEXT,
    call_to_action TEXT,
    facts_to_include TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 23. contents
CREATE TABLE contents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
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
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 24. content_variants
CREATE TABLE content_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL,
    body_text TEXT NOT NULL,
    hook_text TEXT,
    cta_override TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 25. content_assets
CREATE TABLE content_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
    asset_type VARCHAR(50),
    asset_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- NHÓM 6: SEO PAGES, AUDIT & ON-PAGE (MODULE 9)
-- -----------------------------------------------------------------------------

-- 26. seo_pages
CREATE TABLE seo_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
    slug VARCHAR(255) NOT NULL,
    meta_title VARCHAR(255),
    meta_description TEXT,
    canonical_url TEXT,
    is_indexed BOOLEAN DEFAULT false,
    last_crawled_at TIMESTAMPTZ
);

-- 27. seo_audits
CREATE TABLE seo_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seo_page_id UUID REFERENCES seo_pages(id) ON DELETE CASCADE,
    health_score NUMERIC(5,2),
    issues JSONB,
    audited_at TIMESTAMPTZ DEFAULT now()
);

-- 28. internal_links
CREATE TABLE internal_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_page_id UUID REFERENCES seo_pages(id) ON DELETE CASCADE,
    target_page_id UUID REFERENCES seo_pages(id) ON DELETE CASCADE,
    anchor_text VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 29. seo_keywords
CREATE TABLE seo_keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seo_page_id UUID REFERENCES seo_pages(id) ON DELETE CASCADE,
    keyword_id UUID REFERENCES keywords(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false
);

-- 30. rankings
CREATE TABLE rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword_id UUID REFERENCES keywords(id) ON DELETE CASCADE,
    rank_position INT NOT NULL,
    date DATE NOT NULL,
    url_found TEXT
);

-- -----------------------------------------------------------------------------
-- NHÓM 7: DISTRIBUTION, CHANNELS & COMMUNITY (MODULE 10, 11, 12)
-- -----------------------------------------------------------------------------

-- 31. channels
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    platform_name VARCHAR(50) NOT NULL,
    channel_identifier VARCHAR(255)
);

-- 32. social_accounts
CREATE TABLE social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    account_name VARCHAR(255),
    oauth_token_encrypted TEXT,
    is_active BOOLEAN DEFAULT true
);

-- 33. publishing_jobs
CREATE TABLE publishing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    scheduled_for TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'scheduled',
    utm_url TEXT,
    external_post_id VARCHAR(255),
    error_message TEXT
);

-- 34. campaigns
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    utm_campaign VARCHAR(100) NOT NULL,
    start_date DATE,
    end_date DATE
);

-- 35. community_opportunities
CREATE TABLE community_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    platform VARCHAR(50),
    thread_title TEXT,
    thread_url TEXT,
    intent_category VARCHAR(100),
    intent_score NUMERIC(5,2),
    status VARCHAR(50) DEFAULT 'pending'
);

-- 36. community_responses
CREATE TABLE community_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_opportunity_id UUID REFERENCES community_opportunities(id) ON DELETE CASCADE,
    suggested_response TEXT NOT NULL,
    human_approved BOOLEAN DEFAULT false,
    posted_at TIMESTAMPTZ
);

-- 37. traffic_sources
CREATE TABLE traffic_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    source_name VARCHAR(100),
    channel_type VARCHAR(50)
);

-- -----------------------------------------------------------------------------
-- NHÓM 8: ANALYTICS, CONVERSIONS & PERFORMANCE (MODULE 12 & 13)
-- -----------------------------------------------------------------------------

-- 38. analytics_events
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    content_id UUID REFERENCES contents(id) ON DELETE SET NULL,
    event_name VARCHAR(100) NOT NULL,
    session_id VARCHAR(100),
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 39. content_performance
CREATE TABLE content_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    impressions INT DEFAULT 0,
    clicks INT DEFAULT 0,
    ctr NUMERIC(5,2) DEFAULT 0.00,
    organic_traffic INT DEFAULT 0,
    signups INT DEFAULT 0,
    revenue NUMERIC(10,2) DEFAULT 0.00
);

-- 40. conversion_events
CREATE TABLE conversion_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    content_id UUID REFERENCES contents(id) ON DELETE SET NULL,
    conversion_type VARCHAR(50) NOT NULL,
    attributed_value NUMERIC(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- NHÓM 9: EXPERIMENTS (MODULE 15)
-- -----------------------------------------------------------------------------

-- 41. experiments
CREATE TABLE experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    experiment_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'running'
);

-- 42. experiment_variants
CREATE TABLE experiment_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID REFERENCES experiments(id) ON DELETE CASCADE,
    variant_name VARCHAR(10) NOT NULL,
    variant_content TEXT NOT NULL
);

-- 43. experiment_results
CREATE TABLE experiment_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID REFERENCES experiment_variants(id) ON DELETE CASCADE,
    impressions INT DEFAULT 0,
    conversions INT DEFAULT 0,
    conversion_rate NUMERIC(5,2) DEFAULT 0.00,
    is_winner BOOLEAN DEFAULT false
);

-- -----------------------------------------------------------------------------
-- NHÓM 10: AI AGENTS, WORKFLOW, AUDIT & BILLING (MODULE 16, 36, 48, 49)
-- -----------------------------------------------------------------------------

-- 44. ai_agents
CREATE TABLE ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name VARCHAR(100) UNIQUE NOT NULL,
    role_description TEXT,
    system_prompt TEXT,
    is_active BOOLEAN DEFAULT true
);

-- 45. agent_runs
CREATE TABLE agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    triggered_by VARCHAR(50) DEFAULT 'cron',
    status VARCHAR(50) DEFAULT 'running',
    execution_time_ms INT,
    started_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ
);

-- 46. agent_tasks
CREATE TABLE agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    task_code VARCHAR(50) NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    payload JSONB,
    status VARCHAR(50) DEFAULT 'queued',
    confidence_score NUMERIC(5,2),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 49. notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 50. audit_logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_affected VARCHAR(100),
    entity_id UUID,
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- 51. subscriptions
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    plan_tier VARCHAR(50) DEFAULT 'starter',
    status VARCHAR(50) DEFAULT 'active',
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ
);

-- 52. usage
CREATE TABLE usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    tokens_consumed INT DEFAULT 0,
    credits_remaining INT DEFAULT 10000,
    period_date DATE NOT NULL
);

-- -----------------------------------------------------------------------------
-- CHỈ MỤC TỐI ƯU HIỆU NĂNG (INDEXES)
-- -----------------------------------------------------------------------------
CREATE INDEX idx_workspaces_org ON workspaces(org_id);
CREATE INDEX idx_opps_workspace_status ON growth_opportunities(workspace_id, status);
CREATE INDEX idx_contents_workspace_status ON contents(workspace_id, status);
CREATE INDEX idx_publishing_jobs_status_date ON publishing_jobs(status, scheduled_for);
CREATE INDEX idx_analytics_events_content ON analytics_events(content_id, created_at);
CREATE INDEX idx_agent_tasks_queue ON agent_tasks(workspace_id, status);

-- -----------------------------------------------------------------------------
-- NẠP DỮ LIỆU MẪU (SEED DATA - USE CASE TRIPC ĐÀ NẴNG)
-- -----------------------------------------------------------------------------

-- 1. Tổ chức & Người dùng
INSERT INTO organizations (id, name, slug) 
VALUES ('11111111-1111-1111-1111-111111111111', 'TripC Global', 'tripc');

INSERT INTO users (id, org_id, email, full_name, role) 
VALUES 
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'admin@tripc.com', 'TripC Admin', 'owner'),
('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111', 'growth@tripc.com', 'Growth Manager', 'growth_manager');

-- 2. Workspace, Brand & Business Profile
INSERT INTO workspaces (id, org_id, name, website_url, primary_language) 
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'TripC Da Nang', 'https://tripc.vn', 'en');

INSERT INTO brands (workspace_id, brand_voice, tone, guidelines_text, forbidden_terms)
VALUES ('33333333-3333-3333-3333-333333333333', 'Helpful local expert, modern, trustworthy', 'informative and welcoming', 'Focus on verified local facts and direct pricing', ARRAY['guaranteed cheapest', 'unbeatable price']);

INSERT INTO business_profiles (workspace_id, industry, overview, safety_rules) 
VALUES (
    '33333333-3333-3333-3333-333333333333', 
    'Travel & Hospitality Platform', 
    'Platform helping expats and nomads find verified apartments, coworking spaces, and activities in Da Nang.',
    '{"no_hallucinate_pricing": true, "no_hallucinate_address": true}'::jsonb
);

-- 3. Địa điểm & Tệp người dùng
INSERT INTO locations (id, workspace_id, city, district, country, is_primary) 
VALUES 
('44444444-4444-4444-4444-444444444441', '33333333-3333-3333-3333-333333333333', 'Da Nang', 'Ngu Hanh Son', 'Vietnam', true),
('44444444-4444-4444-4444-444444444442', '33333333-3333-3333-3333-333333333333', 'Da Nang', 'Son Tra', 'Vietnam', true);

INSERT INTO audiences (id, workspace_id, name, demographics, pain_points, interests) 
VALUES (
    '55555555-5555-5555-5555-555555555551',
    '33333333-3333-3333-3333-333333333333',
    'Expats & Nomads in Da Nang',
    '{"languages": ["English"], "stay_duration": "1-6 months"}'::jsonb,
    ARRAY['Unstable cafe internet', 'Rental agent scams', 'Lack of English support in gyms'],
    ARRAY['Coworking spaces', 'Beachside apartments', 'Healthy cafes']
);

-- 4. Mục tiêu tăng trưởng (Growth Goal)
INSERT INTO growth_goals (id, workspace_id, title, target_traffic_pct, target_qualified_visits, period_days, primary_conversion, budget_usd, status)
VALUES (
    '66666666-6666-6666-6666-666666666661',
    '33333333-3333-3333-3333-333333333333',
    'Increase Da Nang Expat Qualified Traffic by 50%',
    50.00,
    63000,
    90,
    'signup',
    1500.00,
    'active'
);

-- 5. Cơ hội tăng trưởng (Opportunity Engine)
INSERT INTO growth_opportunities (id, workspace_id, type, topic, keyword, search_intent, audience_id, demand_score, competition_score, business_value_score, freshness_score, priority, status)
VALUES 
('77777777-7777-7777-7777-777777777771', '33333333-3333-3333-3333-333333333333', 'search', 'Da Nang Apartment Rentals', 'apartments for rent in da nang for expats', 'commercial', '55555555-5555-5555-5555-555555555551', 88.0, 45.0, 95.0, 80.0, 'P0', 'planned'),
('77777777-7777-7777-7777-777777777772', '33333333-3333-3333-3333-333333333333', 'search', 'Coworking Spaces', 'best coworking spaces in da nang', 'commercial', '55555555-5555-5555-5555-555555555551', 82.0, 38.0, 90.0, 75.0, 'P0', 'briefed');

-- 6. Content Brief & Nội dung đã xuất bản (Content Factory)
INSERT INTO content_briefs (id, opportunity_id, title, primary_keyword, secondary_keywords, search_intent, target_audience, call_to_action)
VALUES (
    '88888888-8888-8888-8888-888888888881',
    '77777777-7777-7777-7777-777777777772',
    'Top 7 Coworking Spaces in Da Nang with High-Speed Internet',
    'best coworking spaces in da nang',
    ARRAY['coworking an thuong', 'work cafes da nang'],
    'commercial',
    'Digital Nomads in Da Nang',
    'Book verified workspace on TripC'
);

INSERT INTO contents (id, workspace_id, brief_id, title, body_markdown, type, status, content_score, seo_score, business_value, created_by, published_at)
VALUES (
    '99999999-9999-9999-9999-999999999991',
    '33333333-3333-3333-3333-333333333333',
    '88888888-8888-8888-8888-888888888881',
    'Top 7 Coworking Spaces in Da Nang with High-Speed Internet',
    '# Top 7 Coworking Spaces in Da Nang\n\nFinding a reliable workspace in Da Nang with high-speed internet and quiet meeting pods is essential for remote professionals...',
    'article',
    'published',
    92.5,
    94.0,
    90.0,
    'ai',
    now() - interval '5 days'
);

-- 7. Kênh phân phối & Lịch đăng (Distribution)
INSERT INTO channels (id, workspace_id, platform_name, channel_identifier)
VALUES 
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'website', 'https://tripc.vn/blog'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', '33333333-3333-3333-3333-333333333333', 'facebook', 'facebook.com/tripc.danang');

INSERT INTO publishing_jobs (content_id, channel_id, scheduled_for, published_at, status, utm_url)
VALUES (
    '99999999-9999-9999-9999-999999999991',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    now() - interval '5 days',
    now() - interval '5 days',
    'published',
    'https://tripc.vn/blog/top-coworking-spaces-da-nang?utm_source=seo&utm_medium=organic&utm_campaign=q4_growth'
);

-- 8. Kết quả đo lường (Performance)
INSERT INTO content_performance (content_id, metric_date, impressions, clicks, ctr, organic_traffic, signups, revenue)
VALUES 
('99999999-9999-9999-9999-999999999991', CURRENT_DATE - 2, 1890, 162, 8.57, 145, 18, 360.00),
('99999999-9999-9999-9999-999999999991', CURRENT_DATE - 1, 2350, 210, 8.94, 190, 26, 520.00);

-- 9. AI Agents & Nhiệm vụ tự động (Agent Tasks)
INSERT INTO ai_agents (id, agent_name, role_description, system_prompt, is_active)
VALUES 
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Opportunity Agent', 'Scans search demand and ranks high-converting opportunities', 'You identify growth opportunities and calculate demand vs business value.', true),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc', 'Content Agent', 'Generates SEO briefs and articles aligned with brand voice', 'You write high quality articles based on verified knowledge only.', true);

INSERT INTO agent_tasks (agent_id, workspace_id, task_code, action_type, payload, status, confidence_score)
VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc',
    '33333333-3333-3333-3333-333333333333',
    'TASK-001',
    'GENERATE_BRIEF',
    '{"opportunity_id": "77777777-7777-7777-7777-777777777771", "keyword": "apartments for rent in da nang for expats"}'::jsonb,
    'needs_review',
    89.5
);