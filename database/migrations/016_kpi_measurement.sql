-- KPI definitions are pinned in knowledge_contexts.goal with the rest of the goal.
-- Baseline measurements remain immutable, hash-verified metrics.snapshot artifacts.
ALTER TABLE growth_kpis ADD COLUMN IF NOT EXISTS measurement JSONB;
