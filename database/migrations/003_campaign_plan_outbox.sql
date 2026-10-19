-- QQ-02/04: immutable issued knowledge contexts and atomic campaign/task outbox.
CREATE TABLE IF NOT EXISTS knowledge_contexts (
  snapshot_id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_version INT NOT NULL,
  profile JSONB NOT NULL,
  snapshot JSONB NOT NULL,
  goal JSONB,
  assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_current_knowledge_context ON knowledge_contexts(workspace_id) WHERE current;

CREATE TABLE IF NOT EXISTS campaign_plan_acceptances (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  input_version INT NOT NULL,
  plan JSONB NOT NULL,
  record JSONB NOT NULL,
  PRIMARY KEY(workspace_id, plan_id, input_version)
);

CREATE TABLE IF NOT EXISTS plan_task_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
  input_version INT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','claimed','sent','failed')),
  attempts INT NOT NULL DEFAULT 0,
  lease_until TIMESTAMPTZ,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id,input_version)
);
CREATE INDEX IF NOT EXISTS idx_plan_outbox_pending ON plan_task_outbox(status,lease_until);
