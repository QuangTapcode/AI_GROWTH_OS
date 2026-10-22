import { canonicalJson } from '../../lib/hash';
import { validateTaskGraph } from '../tasks/dag';
import type { CampaignPlan } from './schemas';
import { PlanError, type AcceptedPlan, type PlanContext, type PlanRepository, type StoredArtifact } from './service';

/** Explicit test/demo adapter. Volatile; never claim durable queue or DB delivery. */
export class MockPlanRepository implements PlanRepository {
  private artifacts = new Map<string, StoredArtifact>();
  private contexts = new Map<string, PlanContext>();
  private accepted = new Map<string, AcceptedPlan>();
  failNextCommit = false;
  seedArtifact(artifact: StoredArtifact) {
    this.artifacts.set(`${artifact.ref.workspace_id}:${artifact.ref.artifact_id}`, structuredClone(artifact));
  }
  seedContext(workspaceId: string, context: PlanContext) { this.contexts.set(workspaceId, structuredClone(context)); }
  async loadArtifact(workspaceId: string, artifactId: string) {
    const value = this.artifacts.get(`${workspaceId}:${artifactId}`);
    return value ? structuredClone(value) : undefined;
  }
  async loadContext(workspaceId: string) {
    const value = this.contexts.get(workspaceId);
    return value ? structuredClone(value) : undefined;
  }
  async accept(plan: CampaignPlan, context: PlanContext) {
    // No awaits between context recheck and commit: concurrent calls are atomic in this mock.
    if (canonicalJson(this.contexts.get(plan.workspace_id)) !== canonicalJson(context))
      throw new PlanError('STALE_CONTEXT', 'Context changed during validation');
    const key = `${plan.workspace_id}:${plan.plan_id}:${plan.input_version}`;
    const existing = this.accepted.get(key);
    if (existing) {
      if (canonicalJson(existing.plan) !== canonicalJson(plan))
        throw new PlanError('PLAN_CONFLICT', 'Plan ID/version already used with different content', 409);
      return { record: structuredClone(existing), deduplicated: true };
    }
    if (this.failNextCommit) { this.failNextCommit = false; throw new Error('Mock commit failed'); }
    const graphCheck = validateTaskGraph(plan.tasks.map(t => ({ id: t.task_id, dependencies: t.depends_on })));
    if (!graphCheck.valid) {
      throw new PlanError('CYCLIC_DEPENDENCY', graphCheck.error || 'Campaign plan contains a circular dependency', 422);
    }
    const record: AcceptedPlan = {
      plan: structuredClone(plan),
      task_states: Object.fromEntries(plan.tasks.map(t => [t.task_id, t.depends_on.length ? 'blocked' : 'ready'])),
      outbox: plan.tasks.filter(t => !t.depends_on.length).map(t => ({ task_id: t.task_id, operation: t.operation })),
    };
    this.accepted.set(key, record);
    return { record: structuredClone(record), deduplicated: false };
  }
  get records() { return structuredClone([...this.accepted.values()]); }
}
