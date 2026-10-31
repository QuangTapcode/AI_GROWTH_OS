import { randomUUID } from 'node:crypto';
import { activeGoal, goalContext } from '../growthGoals/service';
import { agentProfile } from '../businessProfile/strategy';
import type { Pool, PoolClient } from 'pg';
import { canonicalJson, sha256Hex } from '../../lib/hash';
import { validateTaskGraph } from '../tasks/dag';
import type { ArtifactRef, CampaignPlan } from './schemas';
import { PlanError, type AcceptedPlan, type PlanContext, type PlanRepository, type StoredArtifact } from './service';

type Db = Pool | PoolClient;
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

export class PgPlanRepository implements PlanRepository {
  constructor(private pool: Pool, private options: { requireApprovedArtifactId?: string } = {}) {}

  /** Backend issues context from approved DB rows; callers cannot approve sources here. */
  async issueContext(workspaceId: string, options: { goal?: unknown; assets?: unknown[] } = {}) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspaceId]);
      const profileRow = (await db.query('SELECT * FROM business_profiles WHERE workspace_id=$1 FOR SHARE', [workspaceId])).rows[0];
      if (!profileRow) throw new PlanError('MISSING_PROFILE', 'Workspace has no business profile');
      const profile = agentProfile(profileRow, workspaceId);
      const sourceRows = (await db.query("SELECT * FROM sources WHERE workspace_id=$1 AND status='approved' AND deleted_at IS NULL ORDER BY id FOR SHARE", [workspaceId])).rows;
      const sources = [];
      for (const s of sourceRows) {
        const chunks = (await db.query('SELECT id, text_content, citation_locator FROM source_chunks WHERE workspace_id=$1 AND source_id=$2 AND source_version=$3 ORDER BY chunk_index', [workspaceId, s.id, s.version])).rows;
        const facts = (await db.query('SELECT fact_key, fact_value, unit, verification_status, valid_until FROM source_facts WHERE workspace_id=$1 AND source_id=$2 AND source_version=$3', [workspaceId, s.id, s.version])).rows;
        sources.push({ source_id: s.id, workspace_id: workspaceId, version: s.version, status: s.status,
          title: s.title, kind: s.kind, url_or_blob: s.url_or_blob,
          provenance: s.license && s.attribution ? { license: s.license, attribution: s.attribution,
            source_url: s.source_url, retrieved_at: s.retrieved_at?.toISOString() ?? null } : null,
          chunks: chunks.map(c => ({ chunk_id: c.id, text: c.text_content, locator: c.citation_locator })),
          facts: facts.map(f => ({ key: f.fact_key, value: f.fact_value, unit: f.unit,
            verification: f.verification_status, valid_until: f.valid_until?.toISOString() ?? null })) });
      }
      const id = randomUUID();
      const snapshot = { workspace_id: workspaceId, snapshot_id: id, sources };
      // The active growth goal is pinned with the snapshot unless a caller supplies one explicitly.
      const goal = options.goal !== undefined ? options.goal : goalContext(await activeGoal(db, workspaceId), profile.products);
      await db.query('UPDATE knowledge_contexts SET current=false WHERE workspace_id=$1 AND current', [workspaceId]);
      await db.query('INSERT INTO knowledge_contexts(snapshot_id,workspace_id,profile_version,profile,snapshot,goal,assets) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [id, workspaceId, profile.version, JSON.stringify(profile), JSON.stringify(snapshot), JSON.stringify(goal ?? null), JSON.stringify(options.assets ?? [])]);
      await db.query('COMMIT');
      return { workspace_id: workspaceId, business_profile: profile, snapshot, goal_context: goal ?? null,
        approved_source_versions: sources.map(s => ({ source_id: s.source_id, version: s.version })), context_snapshot_id: id };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  async storeArtifact(item: StoredArtifact) {
    const ref = item.ref;
    if (sha256Hex(canonicalJson({ result: item.result, evidence: item.evidence })) !== ref.content_hash)
      throw new PlanError('ARTIFACT_HASH_MISMATCH', 'Cannot persist corrupt AI artifact');
    const op = item.operation ?? (ref.role === 'research' ? 'research.run' : 'strategy.generate');
    const res = item.result as any;
    const title = res?.selected_opportunity?.topic ?? res?.objective ?? (ref.role === 'growth_lead' ? 'Growth Campaign Plan' : ref.role);
    await this.pool.query(`INSERT INTO content_artifacts(id,workspace_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
      VALUES($1,$2,$3,$4,$5,$6,$7,'ai_result',$8,'ai_run_store',$9,$10) ON CONFLICT(id) DO NOTHING`,
      [ref.artifact_id, ref.workspace_id, ref.version, ref.content_hash, ref.context_snapshot_id, ref.role,
        op, title, JSON.stringify({ artifact: ref, result: item.result }), JSON.stringify(item.evidence)]);
    const existing = await this.loadArtifact(ref.workspace_id, ref.artifact_id);
    if (!existing || !same({ ref: existing.ref, result: existing.result, evidence: existing.evidence }, { ref: item.ref, result: item.result, evidence: item.evidence })) throw new PlanError('ARTIFACT_CONFLICT', 'Artifact IDs are immutable', 409);
  }

  async loadArtifact(workspaceId: string, artifactId: string): Promise<StoredArtifact | undefined> {
    const row = (await this.pool.query('SELECT payload,evidence FROM content_artifacts WHERE workspace_id=$1 AND id=$2', [workspaceId, artifactId])).rows[0];
    return row?.payload?.artifact ? { ref: row.payload.artifact as ArtifactRef, result: row.payload.result, evidence: row.evidence } : undefined;
  }

  private async context(db: Db, workspaceId: string, lock = false): Promise<PlanContext | undefined> {
    const row = (await db.query(`SELECT snapshot_id,profile_version,snapshot FROM knowledge_contexts WHERE workspace_id=$1 AND current ${lock ? 'FOR SHARE' : ''}`, [workspaceId])).rows[0];
    if (!row) return undefined;
    const profile = (await db.query(`SELECT version FROM business_profiles WHERE workspace_id=$1 ${lock ? 'FOR SHARE' : ''}`, [workspaceId])).rows[0];
    const sources = (await db.query(`SELECT id,version FROM sources WHERE workspace_id=$1 AND status='approved' AND deleted_at IS NULL ${lock ? 'FOR SHARE' : ''}`, [workspaceId])).rows;
    const pinned = row.snapshot.sources as { source_id: string; version: number }[];
    return { snapshot_id: row.snapshot_id, profile_version: profile?.version ?? -1,
      approved_sources: sources.filter(s => pinned.some(p => p.source_id === s.id && p.version === s.version)).map(s => ({ source_id: s.id, version: s.version })) };
  }
  loadContext(workspaceId: string) { return this.context(this.pool, workspaceId); }

  async accept(plan: CampaignPlan, context: PlanContext) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Serialize accepts and snapshot issuance in this workspace; no broker side effects here.
      await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [plan.workspace_id]);
      if (this.options.requireApprovedArtifactId) {
        const approved = (await db.query(`SELECT p.id FROM approvals p JOIN content_artifacts a
          ON a.workspace_id=p.workspace_id AND a.id=p.target_id AND a.version=p.target_version AND a.content_hash=p.target_hash
          WHERE p.workspace_id=$1 AND p.target_id=$2 AND p.target_type='artifact' AND p.status='approved'
          AND a.context_snapshot_id=$3 FOR SHARE OF p,a`, [plan.workspace_id, this.options.requireApprovedArtifactId, context.snapshot_id])).rows[0];
        if (!approved) throw new PlanError('PLAN_APPROVAL_REQUIRED', 'Approve the exact Growth Lead plan version before starting SEO', 409);
      }
      if (!same(await this.context(db, plan.workspace_id, true), context)) throw new PlanError('STALE_CONTEXT', 'Context changed during validation');
      const previous = (await db.query('SELECT plan,record FROM campaign_plan_acceptances WHERE workspace_id=$1 AND plan_id=$2 AND input_version=$3', [plan.workspace_id, plan.plan_id, plan.input_version])).rows[0];
      if (previous) {
        if (!same(previous.plan, plan)) throw new PlanError('PLAN_CONFLICT', 'Plan ID/version content changed', 409);
        await db.query('COMMIT');
        return { record: previous.record as AcceptedPlan, deduplicated: true };
      }
      const graphCheck = validateTaskGraph(plan.tasks.map(t => ({ id: t.task_id, dependencies: t.depends_on })));
      if (!graphCheck.valid) {
        throw new PlanError('CYCLIC_DEPENDENCY', graphCheck.error || 'Campaign plan contains a circular dependency', 422);
      }
      await db.query('INSERT INTO campaigns(id,workspace_id,name,utm_campaign) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING', [plan.plan_id, plan.workspace_id, plan.objective.slice(0, 255), `plan-${plan.plan_id}`]);
      const campaign = (await db.query('SELECT workspace_id FROM campaigns WHERE id=$1 FOR SHARE', [plan.plan_id])).rows[0];
      if (campaign?.workspace_id !== plan.workspace_id) throw new PlanError('TENANT_SCOPE_VIOLATION', 'Campaign ID belongs to another workspace');
      for (const task of plan.tasks) {
        await db.query(`INSERT INTO workflow_tasks(id,workspace_id,campaign_id,role,operation,status,input_version,context_snapshot_id,payload)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [task.task_id, plan.workspace_id, plan.plan_id, task.role, task.operation,
          task.depends_on.length ? 'pending' : 'queued', plan.input_version, plan.context_snapshot_id, JSON.stringify(task)]);
      }
      for (const task of plan.tasks) {
        for (const parent of task.depends_on) await db.query('INSERT INTO task_dependencies(task_id,depends_on_task_id,workspace_id) VALUES($1,$2,$3)', [task.task_id, parent, plan.workspace_id]);
        if (!task.depends_on.length) await db.query('INSERT INTO plan_task_outbox(workspace_id,task_id,input_version,operation) VALUES($1,$2,$3,$4)', [plan.workspace_id, task.task_id, plan.input_version, task.operation]);
      }
      const record: AcceptedPlan = { plan, task_states: Object.fromEntries(plan.tasks.map(t => [t.task_id, t.depends_on.length ? 'blocked' : 'ready'])),
        outbox: plan.tasks.filter(t => !t.depends_on.length).map(t => ({ task_id: t.task_id, operation: t.operation })) };
      await db.query('INSERT INTO campaign_plan_acceptances(workspace_id,plan_id,input_version,plan,record) VALUES($1,$2,$3,$4,$5)', [plan.workspace_id, plan.plan_id, plan.input_version, JSON.stringify(plan), JSON.stringify(record)]);
      await db.query('COMMIT');
      return { record, deduplicated: false };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
}
