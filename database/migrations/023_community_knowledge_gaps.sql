-- 023_community_knowledge_gaps.sql
-- Questions the Community bot could not answer from approved sources, and the sources proposed for them.
CREATE TABLE IF NOT EXISTS community_knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  question TEXT NOT NULL,
  ask_count INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'proposed', 'resolved', 'no_source')),
  topic TEXT,
  proposed JSONB NOT NULL DEFAULT '[]'::jsonb,
  reopened INT NOT NULL DEFAULT 0,
  last_asked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);
CREATE INDEX IF NOT EXISTS idx_community_knowledge_gaps_ws_status ON community_knowledge_gaps (workspace_id, status, ask_count DESC);
