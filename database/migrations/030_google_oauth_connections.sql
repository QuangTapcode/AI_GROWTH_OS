-- 030_google_oauth_connections.sql
-- One Google account per workspace, connected by its owner through the OAuth consent screen
-- (Drive read-only for Agent 2 photos, Business Profile for Agent 5). The refresh token is sealed
-- with TOKEN_ENCRYPTION_KEY (lib/secretBox) and never leaves the API. Idempotent.

CREATE TABLE IF NOT EXISTS google_oauth_connections (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    google_email VARCHAR(320),
    google_subject VARCHAR(255),
    scopes TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    refresh_token_enc TEXT NOT NULL,
    connected_by UUID,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT
);
