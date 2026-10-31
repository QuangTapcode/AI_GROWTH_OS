ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS research_strategy JSONB;
COMMENT ON COLUMN business_profiles.research_strategy IS 'Operator topic priorities and attributed competitor lessons; not measured market demand or approved source facts';
