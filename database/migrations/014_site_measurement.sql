-- First-party website publishing and measurement for the learning loop.
-- Approved SEO articles become public posts on the workspace's own site; the site records
-- anonymous page views and CTA clicks (no IP, user agent or contact data). Aggregates feed
-- Performance and Learning when GA4/Search Console are not connected.
ALTER TABLE contents ADD COLUMN IF NOT EXISTS site_id VARCHAR(100);
ALTER TABLE contents ADD COLUMN IF NOT EXISTS slug VARCHAR(160);
ALTER TABLE contents ADD COLUMN IF NOT EXISTS meta_description VARCHAR(300);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contents_site_slug ON contents (site_id, slug) WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS site_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  site_id VARCHAR(100) NOT NULL,
  content_id UUID REFERENCES contents(id) ON DELETE SET NULL,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('page_view', 'cta_click')),
  -- Random per-browser-session id generated client-side; not linked to any person.
  session_id VARCHAR(64) NOT NULL,
  path VARCHAR(300) NOT NULL,
  referrer_host VARCHAR(255),
  -- Requests from the operator's own machine/network (preview, QA) never count as visits.
  internal BOOLEAN NOT NULL DEFAULT false,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_events_workspace_time ON site_events (workspace_id, occurred_at DESC);

ALTER TABLE agent_automation ADD COLUMN IF NOT EXISTS auto_publish_website BOOLEAN NOT NULL DEFAULT false;
