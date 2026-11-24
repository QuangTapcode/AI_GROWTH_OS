-- 029_merchant_agents_live.sql
-- Đưa 8 agent merchant (F&B / Du lịch) từ dữ liệu demo sang vận hành thật:
--   * Multi-LLM router: khóa API mã hóa, cooldown khi bị 429, nhật ký sử dụng.
--   * Agent 2 (Drive): chống trùng theo drive_file_id, kết quả phân tích ảnh.
--   * Agent 3 (Content Planner): lịch nội dung đa kênh.
--   * Agent 5 (Google Maps): review đồng bộ từ Google Business Profile, trạng thái duyệt.
--   * Agent 6/7 (Comment / Booking): hội thoại đặt bàn theo state machine.
--   * Agent 1 (Growth Lead): báo cáo ngày đã gửi (chống gửi trùng).
--   * Ví: giao dịch chờ thanh toán, mã tham chiếu duy nhất, trừ credit khi dùng AI.
-- Mọi lệnh idempotent (IF NOT EXISTS) vì scripts/migrate.ts chạy lại toàn bộ file.

-- ---------- Multi-LLM router ----------
ALTER TABLE llm_adapter_configs ADD COLUMN IF NOT EXISTS fallback_order TEXT[] NOT NULL DEFAULT ARRAY['gemini','deepseek','openai','claude'];
ALTER TABLE llm_adapter_configs ADD COLUMN IF NOT EXISTS cooldowns JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE llm_adapter_configs ALTER COLUMN provider_status SET DEFAULT '{}'::jsonb;
ALTER TABLE llm_adapter_configs ALTER COLUMN latency_ms DROP DEFAULT;
ALTER TABLE llm_adapter_configs ALTER COLUMN latency_ms DROP NOT NULL;

CREATE TABLE IF NOT EXISTS llm_usage_events (
    id BIGSERIAL PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    agent VARCHAR(64) NOT NULL DEFAULT 'unknown',
    provider VARCHAR(32) NOT NULL,
    model VARCHAR(128),
    ok BOOLEAN NOT NULL,
    error_kind VARCHAR(32),          -- rate_limited, quota, timeout, auth, server, bad_request, network, refusal
    error_detail TEXT,
    latency_ms INT,
    input_chars INT,
    output_chars INT,
    switched_from VARCHAR(32),
    credits_charged INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_ws_time ON llm_usage_events(workspace_id, created_at DESC);

-- ---------- Onboarding ----------
ALTER TABLE merchant_onboarding ADD COLUMN IF NOT EXISTS business_name VARCHAR(255);
ALTER TABLE merchant_onboarding ADD COLUMN IF NOT EXISTS parsed_refs JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE merchant_onboarding ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE merchant_onboarding ADD COLUMN IF NOT EXISTS welcome_message TEXT;

-- Lịch chạy của từng agent theo workspace (khóa chống chạy chồng + lần chạy kế tiếp)
CREATE TABLE IF NOT EXISTS merchant_agent_runs (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    agent VARCHAR(64) NOT NULL,
    last_started_at TIMESTAMPTZ,
    last_finished_at TIMESTAMPTZ,
    last_status VARCHAR(32),          -- ok, skipped, failed, not_connected
    last_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ,
    PRIMARY KEY (workspace_id, agent)
);

-- ---------- Agent 2: Drive ----------
ALTER TABLE drive_asset_queue ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
ALTER TABLE drive_asset_queue ADD COLUMN IF NOT EXISTS drive_modified_at TIMESTAMPTZ;
ALTER TABLE drive_asset_queue ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE drive_asset_queue ADD COLUMN IF NOT EXISTS analysis JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE drive_asset_queue ADD COLUMN IF NOT EXISTS analysis_provider VARCHAR(32);
ALTER TABLE drive_asset_queue ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE drive_asset_queue ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'google_drive';
ALTER TABLE drive_asset_queue ALTER COLUMN suggested_channels SET DEFAULT ARRAY['facebook','google_maps','instagram'];
CREATE UNIQUE INDEX IF NOT EXISTS uq_drive_asset_file ON drive_asset_queue(workspace_id, drive_file_id) WHERE drive_file_id IS NOT NULL;

-- ---------- Agent 5: Google Maps ----------
ALTER TABLE gmaps_reputation ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
ALTER TABLE gmaps_reputation ADD COLUMN IF NOT EXISTS review_created_at TIMESTAMPTZ;
ALTER TABLE gmaps_reputation ADD COLUMN IF NOT EXISTS draft_reply TEXT;
ALTER TABLE gmaps_reputation ADD COLUMN IF NOT EXISTS reply_source VARCHAR(32);   -- auto, owner_approved, owner_manual, google_existing
ALTER TABLE gmaps_reputation ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE gmaps_reputation ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE gmaps_reputation ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE gmaps_reputation ALTER COLUMN seo_keywords SET DEFAULT ARRAY[]::text[];
CREATE UNIQUE INDEX IF NOT EXISTS uq_gmaps_external ON gmaps_reputation(workspace_id, item_type, external_id) WHERE external_id IS NOT NULL;

-- ---------- Agent 3: Content calendar (đa kênh) ----------
CREATE TABLE IF NOT EXISTS content_calendar_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    channel VARCHAR(32) NOT NULL,      -- facebook, instagram, google_maps, tiktok, facebook_group
    format VARCHAR(32) NOT NULL DEFAULT 'photo_post', -- photo_post, local_post, carousel_video, poll_post, minigame
    asset_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
    theme TEXT,
    caption TEXT NOT NULL,
    hashtags TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    call_to_action TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'draft', -- draft, approved, publishing, published, failed, rejected
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    external_post_id TEXT,
    error_message TEXT,
    generated_by VARCHAR(32),          -- llm provider hoặc 'template'
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, channel, scheduled_at)
);
CREATE INDEX IF NOT EXISTS idx_calendar_due ON content_calendar_entries(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_calendar_ws_week ON content_calendar_entries(workspace_id, week_start);

-- ---------- Agent 7: Booking conversations ----------
CREATE TABLE IF NOT EXISTS booking_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    contact_ref VARCHAR(255) NOT NULL,
    state VARCHAR(32) NOT NULL DEFAULT 'collecting', -- collecting, awaiting_confirmation, confirmed, handoff, cancelled
    slots JSONB NOT NULL DEFAULT '{}'::jsonb,
    booking_lead_id UUID REFERENCES booking_leads(id) ON DELETE SET NULL,
    turns INT NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_conv_open ON booking_conversations(workspace_id, platform, contact_ref)
  WHERE state IN ('collecting', 'awaiting_confirmation');

ALTER TABLE booking_leads ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE booking_leads ADD COLUMN IF NOT EXISTS contact_ref VARCHAR(255);
ALTER TABLE booking_leads ADD COLUMN IF NOT EXISTS deposit_reference VARCHAR(64);
ALTER TABLE booking_leads ADD COLUMN IF NOT EXISTS source_message_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_deposit_ref ON booking_leads(deposit_reference) WHERE deposit_reference IS NOT NULL;

-- ---------- Agent 1: Daily executive report ----------
CREATE TABLE IF NOT EXISTS daily_executive_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    metrics JSONB NOT NULL,
    summary_markdown TEXT NOT NULL,
    summary_source VARCHAR(32) NOT NULL,     -- llm provider hoặc 'template'
    delivery JSONB NOT NULL DEFAULT '{}'::jsonb, -- {telegram: {status, message_id}, email: {...}}
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, report_date)
);

-- ---------- Ví trả trước ----------
ALTER TABLE merchant_wallet_transactions ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE merchant_wallet_transactions ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE merchant_wallet_transactions ADD COLUMN IF NOT EXISTS confirmed_by VARCHAR(64);
ALTER TABLE merchant_wallet_transactions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_ref ON merchant_wallet_transactions(qr_reference);

-- ---------- Agent 6/7: thêm kênh Instagram (DM + comment) và Zalo OA vào hộp thư cộng đồng ----------
ALTER TABLE community_messages DROP CONSTRAINT IF EXISTS community_messages_platform_check;
ALTER TABLE community_messages ADD CONSTRAINT community_messages_platform_check
  CHECK (platform IN ('facebook_comment', 'facebook_message', 'website_comment', 'manual', 'tripc_chat', 'telegram_message',
                      'instagram_message', 'instagram_comment', 'zalo_message'));
