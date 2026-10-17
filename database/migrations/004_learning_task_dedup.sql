CREATE UNIQUE INDEX IF NOT EXISTS workflow_learning_dedup
ON workflow_tasks(workspace_id, (payload->>'dedup_key'))
WHERE operation='research.run' AND payload ? 'dedup_key';
