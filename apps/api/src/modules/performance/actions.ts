import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Pool } from 'pg';
import { AppError } from '../../lib/errors';
import { canonicalJson, sha256Hex } from '../../lib/hash';

export const actionSchema = z.object({ artifact_id: z.string().uuid(), expected_version: z.number().int().positive(),
  expected_hash: z.string().regex(/^[a-f0-9]{64}$/), action_index: z.number().int().min(0).max(19) }).strict();

/** Owner approval of one immutable recommendation creates at most one downstream task. */
export async function approvePerformanceAction(pool: Pool, workspace: string, actor: string, raw: unknown) {
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(422, 'INVALID_ACTION', parsed.error.message);
  const input = parsed.data, db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspace]);
    const member = (await db.query("SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2 AND status='active' FOR SHARE", [workspace, actor])).rows[0];
    if (member?.role !== 'owner') throw new AppError(403, 'FORBIDDEN', 'Only owners may approve Performance actions');
    const report = (await db.query("SELECT * FROM content_artifacts WHERE workspace_id=$1 AND id=$2 AND operation='analytics.report' FOR UPDATE", [workspace, input.artifact_id])).rows[0];
    if (!report || report.version !== input.expected_version || report.content_hash !== input.expected_hash) throw new AppError(409, 'STALE_ARTIFACT', 'Report version/hash changed');
    const result = report.payload.result;
    if (sha256Hex(canonicalJson({ result, evidence: report.evidence })) !== report.content_hash) throw new AppError(409, 'ARTIFACT_HASH_MISMATCH', 'Report content changed');
    if (result?.synthetic !== false || result.status !== 'draft' || result.missing_facts?.length) throw new AppError(409, 'INCOMPLETE_REPORT', 'Use a complete, non-synthetic measured report');
    const context = (await db.query(`SELECT k.snapshot FROM knowledge_contexts k JOIN business_profiles p ON p.workspace_id=k.workspace_id AND p.version=k.profile_version
      WHERE k.workspace_id=$1 AND k.snapshot_id=$2 AND k.current FOR SHARE`, [workspace, report.context_snapshot_id])).rows[0];
    if (!context) throw new AppError(409, 'STALE_CONTEXT', 'Rebuild the report with the current context');
    for (const source of context.snapshot.sources) {
      if (!(await db.query("SELECT 1 FROM sources WHERE workspace_id=$1 AND id=$2 AND version=$3 AND status='approved' AND deleted_at IS NULL FOR SHARE", [workspace, source.source_id, source.version])).rowCount) {
        throw new AppError(409, 'SOURCE_NOT_APPROVED', 'An input source was changed or revoked');
      }
    }
    const action = result.actions?.[input.action_index];
    if (!action || action.operation !== 'research.run' || action.role !== 'research') throw new AppError(422, 'UNSUPPORTED_ACTION', 'Only grounded Research proposals are supported');
    const hex = createHash('sha256').update(`${workspace}:${report.id}:${report.version}:${input.action_index}`).digest('hex');
    const taskId = `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
    const task = await db.query(`INSERT INTO workflow_tasks(id,workspace_id,role,operation,status,input_version,context_snapshot_id,payload)
      VALUES($1,$2,'research','research.run','queued',1,$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id`, [taskId, workspace,
      report.context_snapshot_id, JSON.stringify({ input: { operation: 'research.run', performance_action: {
        metric_name: action.metric_name, reason: action.reason, report_artifact_id: report.id,
      } }, synthetic: false, requires_human_approval: true,
        performance_action: { ...action, report_artifact_id: report.id, approved_by: actor, approved_at: new Date().toISOString() } })]);
    if (task.rowCount) await db.query('INSERT INTO plan_task_outbox(workspace_id,task_id,input_version,operation) VALUES($1,$2,1,\'research.run\')', [workspace, taskId]);
    await db.query('COMMIT');
    return { task_id: taskId, deduplicated: !task.rowCount };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
