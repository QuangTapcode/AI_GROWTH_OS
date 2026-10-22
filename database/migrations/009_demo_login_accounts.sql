-- ============================================================================
-- AI GROWTH OS — Migration 009: Demo login account directory
--
-- Local/staging fixtures only. This table intentionally contains the demo
-- password so a tester can recover seeded credentials. Never use real
-- credentials here or run the demo seed/table in production.
-- ============================================================================

CREATE TABLE IF NOT EXISTS demo_login_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    password_value TEXT NOT NULL,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, workspace_id),
    UNIQUE (email, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_demo_login_accounts_active
    ON demo_login_accounts (is_active, email);
