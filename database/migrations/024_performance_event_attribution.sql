-- Anonymous event deduplication and campaign attribution. No personal data is stored here.
ALTER TABLE site_events ADD COLUMN IF NOT EXISTS event_id uuid;
ALTER TABLE site_events ADD COLUMN IF NOT EXISTS attribution jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_events_event_id ON site_events(site_id, event_id);
CREATE INDEX IF NOT EXISTS idx_site_events_session_content ON site_events(workspace_id, session_id, content_id, occurred_at) WHERE NOT internal;
-- Migration 003 already supplies the workspace/time index (also usable for ascending scans).
CREATE INDEX IF NOT EXISTS idx_leads_visitor_time ON leads(workspace_id, (context->>'visitor_id'), captured_at)
  WHERE COALESCE(context->>'synthetic','false') <> 'true';
