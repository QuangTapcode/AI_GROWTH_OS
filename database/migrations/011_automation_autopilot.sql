-- Opt-in workspace autopilot. Human review remains the default everywhere.
ALTER TABLE agent_automation
  ADD COLUMN IF NOT EXISTS auto_approve_outputs BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE agent_automation
  ADD COLUMN IF NOT EXISTS auto_publish_facebook BOOLEAN NOT NULL DEFAULT false;
