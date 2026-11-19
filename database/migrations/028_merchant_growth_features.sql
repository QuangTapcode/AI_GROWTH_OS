-- 028_merchant_growth_features.sql
-- Hoàn thiện hạ tầng cho Đội ngũ 8 AI Agent & Nền tảng Tăng trưởng F&B / Du lịch
-- Theo chỉ đạo của Leader: Zero-Tech Onboarding, Booking Leads Hub, Google Maps Specialist,
-- Drive Asset Ingestion, Multi-LLM Adapter Auto-Switch và Ví Nạp Tiền VietQR.

-- 1. Bảng lưu trữ khách đặt bàn tư vấn trực tiếp 1-1 (Agent 7: Direct Booking Concierge)
CREATE TABLE IF NOT EXISTS booking_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    customer_email VARCHAR(255),
    platform VARCHAR(50) NOT NULL DEFAULT 'messenger', -- messenger, instagram, web, telegram, zalo
    party_size INT NOT NULL DEFAULT 2,
    booking_time TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),
    special_notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed', -- pending, confirmed, cancelled, completed
    deposit_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    deposit_status VARCHAR(50) NOT NULL DEFAULT 'unpaid', -- unpaid, partial, paid, refunded
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_leads_workspace ON booking_leads(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_leads_time ON booking_leads(booking_time);

-- 2. Bảng lưu trữ cấu hình Onboarding tối giản 4 bước (Agent 1: Zero-Tech Onboarding)
CREATE TABLE IF NOT EXISTS merchant_onboarding (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    fanpage_url TEXT,
    gmaps_url TEXT,
    gdrive_url TEXT,
    community_group_url TEXT,
    business_type VARCHAR(100) DEFAULT 'restaurant',
    onboarding_completed BOOLEAN NOT NULL DEFAULT false,
    ai_lead_assigned VARCHAR(100) DEFAULT 'growth_lead',
    welcome_message_sent BOOLEAN NOT NULL DEFAULT false,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Bảng Ví Nạp Tiền & Tín Dụng Trả Trước (Wallet Top-up Mockup)
CREATE TABLE IF NOT EXISTS merchant_wallet (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    balance_credits INT NOT NULL DEFAULT 1000, -- 1.000 credits khởi động dùng thử
    balance_vnd NUMERIC(15, 2) NOT NULL DEFAULT 200000,
    tier VARCHAR(50) NOT NULL DEFAULT 'growth', -- starter, growth, enterprise
    auto_recharge BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchant_wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    amount_vnd NUMERIC(15, 2) NOT NULL,
    credits_added INT NOT NULL,
    package_name VARCHAR(100) NOT NULL,
    qr_reference VARCHAR(100) NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'vietqr',
    status VARCHAR(50) NOT NULL DEFAULT 'success',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_workspace ON merchant_wallet_transactions(workspace_id, created_at DESC);

-- 4. Bảng Cấu hình Multi-LLM Adapter với Auto-Switch (Quản trị Admin)
CREATE TABLE IF NOT EXISTS llm_adapter_configs (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    primary_provider VARCHAR(50) NOT NULL DEFAULT 'gemini', -- gemini, deepseek, openai, claude
    auto_switch_enabled BOOLEAN NOT NULL DEFAULT true,
    gemini_api_key TEXT,
    deepseek_api_key TEXT,
    openai_api_key TEXT,
    claude_api_key TEXT,
    active_fallback VARCHAR(50) DEFAULT 'gemini',
    last_switch_at TIMESTAMPTZ,
    last_switch_reason TEXT,
    latency_ms INT DEFAULT 350,
    provider_status JSONB NOT NULL DEFAULT '{"gemini": "active", "deepseek": "ready", "openai": "ready", "claude": "ready"}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Bảng Google Maps Local Posts & Reviews (Agent 5: Google Maps Specialist)
CREATE TABLE IF NOT EXISTS gmaps_reputation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL DEFAULT 'review', -- review, local_post, photo_update
    author_name VARCHAR(255) NOT NULL,
    author_avatar TEXT,
    rating INT DEFAULT 5,
    content TEXT NOT NULL,
    reply_text TEXT,
    replied_at TIMESTAMPTZ,
    seo_keywords TEXT[] DEFAULT ARRAY['Hải sản tươi sống Đà Nẵng', 'Quán ngon view biển', 'Đặc sản ẩm thực miền Trung'],
    status VARCHAR(50) NOT NULL DEFAULT 'replied', -- pending, replied, flagged
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gmaps_workspace ON gmaps_reputation(workspace_id, item_type, status);

-- 6. Bảng Google Drive Real Asset Ingestion (Agent 2: Drive Asset Ingestion)
CREATE TABLE IF NOT EXISTS drive_asset_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    drive_file_id VARCHAR(255),
    asset_type VARCHAR(50) NOT NULL DEFAULT 'food_photo', -- food_photo, menu_board, space_ambiance, video_clip
    vision_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    dish_name VARCHAR(255),
    flavor_notes TEXT,
    generated_caption TEXT,
    suggested_channels TEXT[] DEFAULT ARRAY['facebook', 'google_maps', 'tiktok'],
    status VARCHAR(50) NOT NULL DEFAULT 'staged', -- staged, published, archived
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drive_asset_queue ON drive_asset_queue(workspace_id, status);

