CREATE TABLE IF NOT EXISTS performance_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  site_id varchar(100) NOT NULL,
  content_slug varchar(160),
  hypothesis varchar(500) NOT NULL,
  control_cta varchar(200) NOT NULL,
  treatment_cta varchar(200) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  min_exposures integer NOT NULL DEFAULT 100 CHECK (min_exposures >= 100),
  status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','stopped')),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  stopped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_performance_active_experiment ON performance_experiments(site_id, COALESCE(content_slug,'')) WHERE status='running';
CREATE INDEX IF NOT EXISTS idx_performance_experiments_workspace ON performance_experiments(workspace_id,created_at DESC);
CREATE TABLE IF NOT EXISTS performance_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES performance_experiments(id) ON DELETE CASCADE,
  visitor_hash char(64) NOT NULL,
  variant varchar(10) NOT NULL CHECK (variant IN ('control','treatment')),
  internal boolean NOT NULL DEFAULT false,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  exposed_at timestamptz,
  UNIQUE(experiment_id,visitor_hash)
);
CREATE INDEX IF NOT EXISTS idx_performance_assignment_exposure ON performance_assignments(experiment_id,variant) WHERE exposed_at IS NOT NULL AND NOT internal;
