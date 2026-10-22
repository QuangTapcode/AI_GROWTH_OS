-- AI Growth OS — Migration 008: tenant-scoped connector metadata
-- Secrets stay in a vault/env adapter. This table stores only non-secret refs,
-- granted scopes and probe state so the six agents can fail closed per tenant.

CREATE TABLE IF NOT EXISTS integration_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    account_ref VARCHAR(255),
    display_name VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'not_connected'
      CHECK (status IN ('not_connected', 'connecting', 'connected', 'error', 'revoked')),
    scopes TEXT[] NOT NULL DEFAULT '{}',
    credential_ref TEXT,
    last_error TEXT,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, provider, account_ref)
);

CREATE INDEX IF NOT EXISTS idx_integration_connections_workspace
  ON integration_connections(workspace_id, provider, status);
