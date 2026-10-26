import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { AiAdapter } from '../adapters/AiAdapter';

const canonical = (value: unknown): string => JSON.stringify(sort(value));
function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => [key, sort(v)]));
  return value;
}

/** Durable DB outbox consumer; one task per tick, stable AI idempotency across lease recovery. */
export class PlanOutboxRunner {
  constructor(private pool: Pool, private ai: AiAdapter) {}

  async runOnce() {
    await this.pool.query(`WITH expired AS (UPDATE plan_task_outbox SET status='failed',error_code='LEASE_EXHAUSTED',lease_until=NULL
      WHERE status='claimed' AND lease_until<now() AND attempts>=3 RETURNING task_id)
      UPDATE workflow_tasks SET status='failed',error_details='{"code":"LEASE_EXHAUSTED"}',updated_at=now() WHERE id IN(SELECT task_id FROM expired)`);
    const claimed = (await this.pool.query(`UPDATE plan_task_outbox SET status='claimed',lease_until=now()+interval '10 minutes',attempts=attempts+1
      WHERE id=(SELECT id FROM plan_task_outbox WHERE (status='pending' OR (status='claimed' AND lease_until<now())) AND attempts<3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`)).rows[0];
    if (!claimed) return null;
    try {
      const task = (await this.pool.query('SELECT * FROM workflow_tasks WHERE workspace_id=$1 AND id=$2', [claimed.workspace_id, claimed.task_id])).rows[0];
      if (!task || ['completed', 'cancelled', 'failed'].includes(task.status)) throw new Error('TASK_NOT_RUNNABLE');
      const deadline = task?.payload?.deadline ?? task?.payload?.input?.deadline;
      if (deadline && Date.parse(deadline) <= Date.now()) throw new Error('TASK_DEADLINE_EXCEEDED');
      const context = (await this.pool.query('SELECT * FROM knowledge_contexts WHERE workspace_id=$1 AND snapshot_id=$2 AND current', [claimed.workspace_id, task.context_snapshot_id])).rows[0];
      const profile = (await this.pool.query('SELECT version FROM business_profiles WHERE workspace_id=$1', [claimed.workspace_id])).rows[0];
      if (!context || profile?.version !== context.profile_version) throw new Error('STALE_CONTEXT');
      for (const source of context.snapshot.sources) {
        const row = (await this.pool.query("SELECT id FROM sources WHERE workspace_id=$1 AND id=$2 AND version=$3 AND status='approved' AND deleted_at IS NULL", [claimed.workspace_id, source.source_id, source.version])).rows[0];
        if (!row) throw new Error('SOURCE_NOT_APPROVED');
      }
      const load = async (id: string) => {
        const row = (await this.pool.query('SELECT payload,evidence FROM content_artifacts WHERE workspace_id=$1 AND id=$2', [claimed.workspace_id, id])).rows[0];
        if (!row?.payload?.artifact) throw new Error('MISSING_ARTIFACT');
        return { artifact: row.payload.artifact, result: row.payload.result, evidence: row.evidence };
      };
      const payload: Record<string, unknown> = { workspace_id: claimed.workspace_id, business_profile: context.profile,
        snapshot: context.snapshot, goal_context: context.goal };
      if (task.operation === 'seo.local_draft') {
        payload.cta = task.payload.brief.cta;
        payload.research = await load(task.payload.input_artifact_refs[0].artifact_id);
        // Write about the opportunity Growth Lead selected (its brief topic), not whichever finding is first.
        const findings = ((payload.research as { result?: { findings?: { topic?: string }[] } }).result?.findings) ?? [];
        const selected = findings.findIndex((f) => f.topic === task.payload.brief.topic);
        if (selected < 0) throw new Error('SELECTED_FINDING_MISSING');
        payload.finding_index = selected;
      } else if (task.operation === 'content.repurpose') {
        payload.cta = task.payload.brief.cta;
        const parent = (await this.pool.query("SELECT result_ref FROM workflow_tasks WHERE workspace_id=$1 AND id=$2 AND status='completed'", [claimed.workspace_id, task.payload.depends_on[0]])).rows[0];
        if (!parent?.result_ref) throw new Error('DEPENDENCY_NOT_APPROVED');
        payload.source_article = await load(parent.result_ref);
        payload.assets = context.assets;
        const automation = (await this.pool.query(
          'SELECT auto_publish_facebook FROM agent_automation WHERE workspace_id=$1',
          [claimed.workspace_id],
        )).rows[0];
        if (automation?.auto_publish_facebook === true) payload.target_channels = ['facebook'];
      } else if (task.operation === 'strategy.generate') {
        const research = await load(task.payload.input.research_artifact_id);
        payload.research = research.result; payload.research_artifact = research.artifact;
        payload.cta = task.payload.input.cta; payload.deadline = task.payload.input.deadline;
        payload.score_factors = task.payload.input.score_factors ?? {};
      } else if (task.operation === 'community.response') {
        payload.question = task.payload.input.question;
      } else if (task.operation === 'analytics.report' || task.operation === 'experiment.hypothesis') {
        payload.metrics = task.payload.input.metrics_artifact_id ? await load(task.payload.input.metrics_artifact_id) : null;
        if (task.operation === 'experiment.hypothesis') payload.experiment = task.payload.input.experiment;
      } else if (task.operation === 'learning.analyze') {
        const input = task.payload.input;
        payload.performance = input.performance_artifact_id ? await load(input.performance_artifact_id) : null;
        payload.lead_summary = input.lead_summary_artifact_id ? await load(input.lead_summary_artifact_id) : null;
        payload.iteration = input.iteration; payload.max_iterations = input.max_iterations; payload.task_quota = input.task_quota;
      } else if (task.operation === 'research.run') {
        // Latest search landscape observed before the task: metadata only, never page text.
        // Rank in the previous run (same query + URL) tells Research what is new or rising.
        payload.trend_signals = (await this.pool.query(`WITH runs AS (SELECT discovery_run_id, max(observed_at) AS at FROM trend_signals
            WHERE workspace_id=$1 AND observed_at<=$2 GROUP BY discovery_run_id ORDER BY at DESC LIMIT 2),
          cur AS (SELECT discovery_run_id FROM runs ORDER BY at DESC LIMIT 1),
          prev AS (SELECT discovery_run_id FROM runs ORDER BY at ASC LIMIT 1 OFFSET 0)
          SELECT s.id AS signal_id, s.query, s.rank, s.title, s.url, s.domain, s.observed_at, p.rank AS previous_rank,
            (p.id IS NULL AND (SELECT count(*) FROM runs) > 1 AND EXISTS (SELECT 1 FROM trend_signals q WHERE q.workspace_id=s.workspace_id
              AND q.discovery_run_id=(SELECT discovery_run_id FROM prev) AND q.query=s.query)) AS is_new
          FROM trend_signals s LEFT JOIN trend_signals p ON p.workspace_id=s.workspace_id AND (SELECT count(*) FROM runs) > 1
            AND p.discovery_run_id=(SELECT discovery_run_id FROM prev) AND p.query=s.query AND p.url=s.url
          WHERE s.workspace_id=$1 AND s.discovery_run_id=(SELECT discovery_run_id FROM cur)
          ORDER BY s.rank, s.query LIMIT 30`, [claimed.workspace_id, task.created_at])).rows
          .map((row: { observed_at: Date | string }) => ({ ...row, observed_at: new Date(row.observed_at).toISOString() }));
      } else throw new Error('UNKNOWN_PLAN_OPERATION');
      await this.pool.query("UPDATE workflow_tasks SET status='running',started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=$1 AND status NOT IN ('completed','cancelled','failed')", [task.id]);
      const result = await this.ai.run({ operation: 'content', aiOperation: task.operation, input: payload,
        job_id: task.id, workspace_id: claimed.workspace_id, input_version: task.input_version,
        trace_id: `plan-task:${task.id}`, context_snapshot_id: context.snapshot_id,
        // Draft generation on a local model exceeds the 120s default; AI caps this at its job deadline.
        timeout_seconds: 600,
        approved_source_versions: context.snapshot.sources.map((s: { source_id: string; version: number }) => ({ source_id: s.source_id, version: s.version })),
        synthetic: Boolean(task.payload.synthetic || (payload.research as { result?: { synthetic?: boolean } })?.result?.synthetic ||
          (payload.source_article as { result?: { synthetic?: boolean } })?.result?.synthetic ||
          Object.values(payload).some(value => Boolean((value as { result?: { synthetic?: boolean }; synthetic?: boolean } | null)?.result?.synthetic || (value as { synthetic?: boolean } | null)?.synthetic))) });
      const artifact = result.artifact as { artifact_id: string; workspace_id: string; version: number; content_hash: string; context_snapshot_id: string; role: string } | null;
      if (!artifact || artifact.workspace_id !== claimed.workspace_id || artifact.version !== task.input_version || artifact.context_snapshot_id !== context.snapshot_id || artifact.role !== task.role)
        throw new Error('INVALID_AI_ARTIFACT');
      const hash = createHash('sha256').update(canonical({ result: result.output, evidence: result.evidence ?? [] })).digest('hex');
      if (hash !== artifact.content_hash) throw new Error('ARTIFACT_HASH_MISMATCH');
      const db = await this.pool.connect();
      try {
        await db.query('BEGIN');
        const lease = (await db.query("SELECT id FROM plan_task_outbox WHERE id=$1 AND status='claimed' AND attempts=$2 FOR UPDATE", [claimed.id, claimed.attempts])).rows[0];
        if (!lease) throw new Error('LEASE_LOST');
        await db.query('SELECT id FROM workflow_tasks WHERE id=$1 FOR UPDATE', [task.id]);
        await db.query(`INSERT INTO content_artifacts(id,workspace_id,task_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
          VALUES($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::varchar,$6::uuid,$7::varchar,$8::varchar,'ai_result',$7::varchar,'ai_run_store',$9::jsonb,$10::jsonb) ON CONFLICT(id) DO NOTHING`,
          [artifact.artifact_id, claimed.workspace_id, task.id, artifact.version, hash, context.snapshot_id, task.role, task.operation,
            JSON.stringify({ artifact, result: result.output, run_metadata: { run_id: result.run_id, model_version: result.model,
              prompt_version: result.prompt_version, input_version: task.input_version, trace_id: `plan-task:${task.id}`, provider_calls: result.provider_calls } }), JSON.stringify(result.evidence ?? [])]);
        const saved = (await db.query('SELECT workspace_id,content_hash FROM content_artifacts WHERE id=$1', [artifact.artifact_id])).rows[0];
        if (saved?.workspace_id !== claimed.workspace_id || saved.content_hash !== hash) throw new Error('ARTIFACT_HASH_MISMATCH');
        const requiresApproval = task.payload?.requires_human_approval !== false;
        if (requiresApproval) {
          // The review UI reads the approval ledger, while the worker owns
          // artifact creation. Create the pending approval in the same
          // transaction so an awaiting task can never become invisible to
          // Review Queue. The guard keeps retries idempotent and allows a
          // fresh approval after a previous rejection/revocation.
          await db.query(`
            INSERT INTO approvals (workspace_id, target_type, target_id, target_version, target_hash, status)
            SELECT $1::uuid, 'artifact', $2::uuid, $3::integer, $4::varchar, 'pending'
            WHERE NOT EXISTS (
              SELECT 1 FROM approvals
              WHERE workspace_id = $1::uuid AND target_type = 'artifact' AND target_id = $2::uuid
                AND target_version = $3::integer AND target_hash = $4::varchar AND status IN ('pending', 'approved')
            )`, [claimed.workspace_id, artifact.artifact_id, artifact.version, hash]);
        }
        await db.query("UPDATE workflow_tasks SET status=CASE WHEN status='completed' THEN status ELSE $3 END,result_ref=$2,error_details=NULL,completed_at=CASE WHEN $3='completed' THEN now() ELSE completed_at END,updated_at=now() WHERE id=$1", [task.id, artifact.artifact_id, requiresApproval ? 'awaiting_approval' : 'completed']);
        // A retry may have recorded a transient database/provider error before
        // the same outbox item succeeds. Clear that stale error so the UI and
        // monitoring reflect the final delivery state.
        await db.query("UPDATE plan_task_outbox SET status='sent',lease_until=NULL,error_code=NULL WHERE id=$1", [claimed.id]);
        await db.query('COMMIT');
      } catch (error) { await db.query('ROLLBACK'); throw error; }
      finally { db.release(); }
      return { task_id: task.id, artifact, output: result.output, evidence: result.evidence ?? [], model: result.model, run_id: result.run_id, status: 'awaiting_approval' };
    } catch (error) {
      console.error('[plan-outbox]', error);
      const permanent = (error as { permanent?: boolean }).permanent === true ||
        ['TASK_NOT_RUNNABLE', 'TASK_DEADLINE_EXCEEDED', 'SELECTED_FINDING_MISSING', 'STALE_CONTEXT', 'SOURCE_NOT_APPROVED', 'DEPENDENCY_NOT_APPROVED', 'UNKNOWN_PLAN_OPERATION', 'INVALID_AI_ARTIFACT', 'ARTIFACT_HASH_MISMATCH'].includes((error as Error).message);
      const owned = await this.pool.query("UPDATE plan_task_outbox SET status=$2::varchar,lease_until=NULL,error_code=$3::text WHERE id=$1::uuid AND status='claimed' AND attempts=$4::integer RETURNING task_id", [claimed.id, permanent || claimed.attempts >= 3 ? 'failed' : 'pending', (error as Error).message, claimed.attempts]);
      if (owned.rowCount && !permanent && claimed.attempts < 3) await this.pool.query("UPDATE workflow_tasks SET status='queued',error_details=$2,updated_at=now() WHERE id=$1 AND status='running'", [claimed.task_id, JSON.stringify({ code: (error as Error).message })]);
      if (owned.rowCount && (permanent || claimed.attempts >= 3)) await this.pool.query("UPDATE workflow_tasks SET status='failed',error_details=$2,updated_at=now() WHERE id=$1 AND status NOT IN('completed','cancelled')", [claimed.task_id, JSON.stringify({ code: (error as Error).message })]);
      throw error;
    }
  }
}
