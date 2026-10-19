CREATE TABLE IF NOT EXISTS agent_automation (
 workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
 actor_id UUID NOT NULL REFERENCES users(id),
 enabled BOOLEAN NOT NULL DEFAULT false,
 interval_hours INT NOT NULL DEFAULT 24 CHECK(interval_hours BETWEEN 1 AND 168),
 cta TEXT NOT NULL DEFAULT 'Contact our team',
 next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 last_tick_at TIMESTAMPTZ,
 last_error TEXT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agent_automation_handoffs (
 workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 task_id UUID NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
 handled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,task_id)
);
