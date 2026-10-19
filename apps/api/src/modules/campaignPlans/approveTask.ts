import type { Pool } from 'pg';
import { PlanError } from './service';
import { canonicalJson, sha256Hex } from '../../lib/hash';

/** Owner review pins actual output hash/version, then atomically opens dependent work. */
export async function approvePlanTask(pool: Pool, input: { workspaceId: string; taskId: string; actorId: string; version: number; hash: string; allowSynthetic?: boolean }) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const member = (await db.query("SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2 AND status='active' FOR SHARE", [input.workspaceId, input.actorId])).rows[0];
    if (member?.role !== 'owner') throw new PlanError('PERMISSION_DENIED', 'Only an active workspace owner can approve', 403);
    const task = (await db.query('SELECT * FROM workflow_tasks WHERE workspace_id=$1 AND id=$2 FOR UPDATE', [input.workspaceId, input.taskId])).rows[0];
    if (!task?.result_ref) throw new PlanError('MISSING_TASK_RESULT', 'Task has no persisted result');
    const artifact = (await db.query('SELECT * FROM content_artifacts WHERE workspace_id=$1 AND id=$2 FOR SHARE', [input.workspaceId, task.result_ref])).rows[0];
    if (!artifact || artifact.version !== input.version || artifact.content_hash !== input.hash)
      throw new PlanError('STALE_APPROVAL', 'Artifact hash/version changed', 409);
    const result = artifact.payload.result;
    if (sha256Hex(canonicalJson({ result, evidence: artifact.evidence })) !== artifact.content_hash)
      throw new PlanError('ARTIFACT_HASH_MISMATCH', 'Stored artifact content changed');
    if (result?.synthetic && !input.allowSynthetic) throw new PlanError('SYNTHETIC_NOT_ALLOWED', 'Mock outputs require explicit sandbox mode');
    if (result?.status !== 'draft' || result.missing_facts?.length)
      throw new PlanError('MISSING_ARTIFACT_DATA', 'Cannot approve an incomplete draft');
    const context = (await db.query('SELECT snapshot,profile_version FROM knowledge_contexts WHERE workspace_id=$1 AND snapshot_id=$2 AND current FOR SHARE', [input.workspaceId, task.context_snapshot_id])).rows[0];
    const profile = (await db.query('SELECT version FROM business_profiles WHERE workspace_id=$1 FOR SHARE', [input.workspaceId])).rows[0];
    if (!context || profile?.version !== context.profile_version) throw new PlanError('STALE_CONTEXT', 'Rebuild against current context');
    for (const source of context.snapshot.sources) {
      const current = (await db.query("SELECT id FROM sources WHERE workspace_id=$1 AND id=$2 AND version=$3 AND status='approved' AND deleted_at IS NULL FOR SHARE", [input.workspaceId, source.source_id, source.version])).rows[0];
      if (!current) throw new PlanError('SOURCE_NOT_APPROVED', 'Source version is no longer approved');
    }
    if (task.status !== 'completed') {
      if (task.status !== 'awaiting_approval') throw new PlanError('INVALID_TASK_STATE', 'Task is not awaiting approval');
      await db.query(`INSERT INTO approvals(workspace_id,target_type,target_id,target_version,target_hash,status,decision,actor_id,actor_role)
        VALUES($1,'artifact',$2,$3,$4,'approved','approve',$5,'owner')`, [input.workspaceId, artifact.id, input.version, input.hash, input.actorId]);
      await db.query("UPDATE workflow_tasks SET status='completed',completed_at=now(),updated_at=now() WHERE id=$1", [task.id]);
    }
    const children = (await db.query(`SELECT t.* FROM workflow_tasks t WHERE t.workspace_id=$1 AND t.campaign_id=$2 AND t.status='pending'
      AND NOT EXISTS(SELECT 1 FROM task_dependencies d JOIN workflow_tasks parent ON parent.id=d.depends_on_task_id WHERE d.task_id=t.id AND parent.status<>'completed') FOR UPDATE`, [input.workspaceId, task.campaign_id])).rows;
    for (const child of children) {
      await db.query("UPDATE workflow_tasks SET status='queued',updated_at=now() WHERE id=$1", [child.id]);
      await db.query('INSERT INTO plan_task_outbox(workspace_id,task_id,input_version,operation) VALUES($1,$2,$3,$4) ON CONFLICT(task_id,input_version) DO NOTHING', [input.workspaceId, child.id, child.input_version, child.operation]);
    }
    await db.query('COMMIT');
    return { status: 'approved', task_id: task.id, opened_tasks: children.map(t => t.id) };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
