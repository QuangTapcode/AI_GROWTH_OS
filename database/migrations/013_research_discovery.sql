-- Research & Trend discovery: search-result metadata (trend signals) and URL ingest state.
-- Trend signals store only query/rank/title/URL of a search result, never page text;
-- page text enters the system only through an ingested, owner-approved source.
CREATE TABLE IF NOT EXISTS trend_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  discovery_run_id UUID NOT NULL,
  query VARCHAR(200) NOT NULL,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 50),
  title VARCHAR(300) NOT NULL,
  url TEXT NOT NULL,
  domain VARCHAR(255) NOT NULL,
  engine VARCHAR(50),
  -- Set when the result is on the open/official source policy and was queued for ingest.
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, discovery_run_id, query, rank)
);
CREATE INDEX IF NOT EXISTS idx_trend_signals_workspace_observed ON trend_signals (workspace_id, observed_at DESC);

-- The worker fetches imported URL sources; failures are retried a bounded number of times
-- and the last error stays visible to the owner instead of silently disappearing.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS ingest_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS ingest_error TEXT;
