import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { canonicalJson, sha256Hex } from '../../lib/hash';
import { artifactRefSchema } from './schemas';
import { PlanError } from './service';

/** Explicit owner approval of an immutable learning artifact. Never called by the model. */
export async function acceptLearningTasks(pool: Pool, workspaceId: string, actorId: string, body: unknown, allowSynthetic = false) {
  const parsed = artifactRefSchema.safeParse(body);
  if (!parsed.success || parsed.data.role !== 'growth_lead' || parsed.data.workspace_id !== workspaceId)
    throw new PlanError('INVALID_ARTIFACT_REF', 'Expected a workspace-scoped learning artifact');
  const ref = parsed.data;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspaceId]);
    const member = (await db.query("SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2 AND status='active' FOR SHARE", [workspaceId, actorId])).rows[0];
    if (member?.role !== 'owner') throw new PlanError('PERMISSION_DENIED', 'An active owner must approve learning tasks', 403);
    const row = (await db.query('SELECT * FROM content_artifacts WHERE workspace_id=$1 AND id=$2 FOR SHARE', [workspaceId, ref.artifact_id])).rows[0];
    if (!row || row.operation !== 'learning.analyze' || canonicalJson(row.payload.artifact) !== canonicalJson(ref) ||
      sha256Hex(canonicalJson({ result: row.payload.result, evidence: row.evidence })) !== ref.content_hash)
      throw new PlanError('ARTIFACT_MISMATCH', 'Learning artifact is absent, stale or corrupt');
    const result = row.payload.result;
    if (result.synthetic && !allowSynthetic) throw new PlanError('SYNTHETIC_NOT_ALLOWED', 'Mock learning requires explicit sandbox mode');
    const context = (await db.query('SELECT * FROM knowledge_contexts WHERE workspace_id=$1 AND snapshot_id=$2 AND current FOR SHARE', [workspaceId, ref.context_snapshot_id])).rows[0];
    const profile = (await db.query('SELECT version FROM business_profiles WHERE workspace_id=$1 FOR SHARE', [workspaceId])).rows[0];
    if (!context || context.profile_version !== profile?.version || result.profile_version !== profile.version || result.workspace_id !== workspaceId || result.context_snapshot_id !== context.snapshot_id)
      throw new PlanError('STALE_CONTEXT', 'Learning must use the current context/profile');
    for (const source of context.snapshot.sources) {
      if (!(await db.query("SELECT id FROM sources WHERE workspace_id=$1 AND id=$2 AND version=$3 AND status='approved' AND deleted_at IS NULL FOR SHARE", [workspaceId, source.source_id, source.version])).rowCount)
        throw new PlanError('SOURCE_NOT_APPROVED', 'Rebuild learning after source changes');
    }
    if (result.status !== 'draft' || result.missing_facts?.length || !Number.isInteger(result.iteration) || result.iteration < 0 ||
      !Number.isInteger(result.max_iterations) || result.max_iterations > 3 || result.max_iterations < 1 || !Array.isArray(result.next_tasks) || result.next_tasks.length > 1)
      throw new PlanError('INVALID_LEARNING', 'Learning requires complete aggregate inputs and bounded iterations/quota');
    const refs = result.input_artifact_refs;
    if (!Array.isArray(refs) || refs.length !== 2 || refs[0].role !== 'performance') throw new PlanError('INVALID_LEARNING_INPUTS', 'Performance and lead aggregate references required');
    for (const upstream of refs) {
      const saved = (await db.query('SELECT * FROM content_artifacts WHERE workspace_id=$1 AND id=$2 FOR SHARE', [workspaceId, upstream.artifact_id])).rows[0];
      if (!saved || saved.content_hash !== upstream.content_hash || saved.version !== upstream.version || saved.context_snapshot_id !== context.snapshot_id ||
        canonicalJson(saved.payload.artifact) !== canonicalJson(upstream) ||
        sha256Hex(canonicalJson({ result: saved.payload.result, evidence: saved.evidence })) !== upstream.content_hash)
        throw new PlanError('ARTIFACT_MISMATCH', 'Persisted learning input is missing or stale');
      if (saved.payload.result.synthetic && !allowSynthetic) throw new PlanError('SYNTHETIC_NOT_ALLOWED', 'Synthetic upstream data requires sandbox mode');
    }
    const expectedKey = createHash('sha256').update(`${workspaceId}:${refs[0].artifact_id}:${refs[0].version}:${refs[1].artifact_id}:${refs[1].version}:${result.iteration}`).digest('hex');
    const ids: string[] = [];
    for (const task of result.next_tasks) {
      if (result.iteration >= result.max_iterations || task.iteration !== result.iteration + 1 || task.role !== 'research' || task.operation !== 'research.run' ||
        task.dedup_key !== expectedKey || task.requires_human_approval !== true || canonicalJson(task.input_artifact_refs) !== canonicalJson(refs))
        throw new PlanError('INVALID_LEARNING_TASK', 'Invalid role, quota, iteration, input refs or dedup key');
      const existing = (await db.query("SELECT id FROM workflow_tasks WHERE workspace_id=$1 AND operation='research.run' AND payload->>'dedup_key'=$2", [workspaceId, expectedKey])).rows[0];
      if (existing) { ids.push(existing.id); continue; }
      const id = randomUUID();
      await db.query("INSERT INTO workflow_tasks(id,workspace_id,role,operation,status,input_version,context_snapshot_id,payload) VALUES($1,$2,'research','research.run','queued',1,$3,$4)", [id, workspaceId, context.snapshot_id, JSON.stringify({ ...task, synthetic: Boolean(result.synthetic), learning_artifact: ref })]);
      await db.query("INSERT INTO plan_task_outbox(workspace_id,task_id,input_version,operation) VALUES($1,$2,1,'research.run')", [workspaceId, id]);
      // The worker already queued a pending review for this artifact: decide it rather than
      // adding a second approval, so the Review Queue item does not stay open.
      const decided = await db.query(
        `UPDATE approvals SET status='approved',decision='approve',actor_id=$5,actor_role='owner',updated_at=now()
          WHERE workspace_id=$1 AND target_type='artifact' AND target_id=$2 AND target_version=$3 AND target_hash=$4 AND status='pending'`,
        [workspaceId, ref.artifact_id, ref.version, ref.content_hash, actorId]);
      if (!decided.rowCount) {
        await db.query(
          `INSERT INTO approvals(workspace_id,target_type,target_id,target_version,target_hash,status,decision,actor_id,actor_role)
           SELECT $1,'artifact',$2,$3,$4,'approved','approve',$5,'owner'
            WHERE NOT EXISTS (SELECT 1 FROM approvals WHERE workspace_id=$1 AND target_type='artifact' AND target_id=$2
              AND target_version=$3 AND target_hash=$4 AND status='approved')`,
          [workspaceId, ref.artifact_id, ref.version, ref.content_hash, actorId]);
      }
      await db.query("UPDATE workflow_tasks SET status='completed',completed_at=now(),updated_at=now() WHERE workspace_id=$1 AND result_ref=$2 AND status='awaiting_approval'", [workspaceId, ref.artifact_id]);
      ids.push(id);
    }
    await db.query('COMMIT');
    return { task_ids: ids, approval_required_for_outputs: true };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
