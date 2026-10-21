-- Ensure every AI artifact waiting for human review has a visible approval row.
-- The worker creates rows transactionally for new artifacts; this backfill
-- repairs artifacts produced before that worker path was wired to the ledger.
INSERT INTO approvals (
    workspace_id,
    target_type,
    target_id,
    target_version,
    target_hash,
    status
)
SELECT
    t.workspace_id,
    'artifact',
    a.id,
    a.version,
    a.content_hash,
    'pending'
FROM workflow_tasks t
JOIN content_artifacts a
  ON a.workspace_id = t.workspace_id
 AND a.id = t.result_ref
WHERE t.status = 'awaiting_approval'
  AND NOT EXISTS (
      SELECT 1
      FROM approvals existing
      WHERE existing.workspace_id = t.workspace_id
        AND existing.target_type = 'artifact'
        AND existing.target_id = a.id
        AND existing.target_version = a.version
        AND existing.target_hash = a.content_hash
  );
