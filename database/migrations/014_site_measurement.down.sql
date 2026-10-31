ALTER TABLE agent_automation DROP COLUMN IF EXISTS auto_publish_website;
DROP TABLE IF EXISTS site_events CASCADE;
DROP INDEX IF EXISTS idx_contents_site_slug;
ALTER TABLE contents DROP COLUMN IF EXISTS meta_description;
ALTER TABLE contents DROP COLUMN IF EXISTS slug;
ALTER TABLE contents DROP COLUMN IF EXISTS site_id;
