import { canonicalJson, sha256Hex } from '../../lib/hash';
import { artifactRefSchema, planSchema, type ArtifactRef, type CampaignPlan } from './schemas';

export interface StoredArtifact {
  ref: ArtifactRef;
  result: unknown;
  evidence: unknown[];
  operation?: string;
}
/** Loaded by backend from authenticated workspace context, never from request body. */
export interface PlanContext {
  snapshot_id: string;
  profile_version: number;
  approved_sources: { source_id: string; version: number }[];
}
export interface AcceptedPlan {
  plan: CampaignPlan;
  task_states: Record<string, 'ready' | 'blocked'>;
  outbox: { task_id: string; operation: string }[];
}
export interface PlanRepository {
  loadArtifact(workspaceId: string, artifactId: string): Promise<StoredArtifact | undefined>;
  loadContext(workspaceId: string): Promise<PlanContext | undefined>;
  /** Must recheck context, deduplicate and commit campaign/tasks/outbox atomically. */
  accept(plan: CampaignPlan, context: PlanContext): Promise<{ record: AcceptedPlan; deduplicated: boolean }>;
}
export class PlanError extends Error {
  constructor(public code: string, message: string, public status = 422) { super(message); }
}
const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
function fail(code: string, message: string): never { throw new PlanError(code, message); }

async function resolve(repo: PlanRepository, workspaceId: string, ref: ArtifactRef): Promise<StoredArtifact> {
  if (ref.workspace_id !== workspaceId) fail('TENANT_SCOPE_VIOLATION', 'Foreign artifact reference');
  const artifact = await repo.loadArtifact(workspaceId, ref.artifact_id);
  if (!artifact || !equal(artifact.ref, ref)) fail('ARTIFACT_MISMATCH', 'Artifact reference is absent or stale');
  // Compare hashes produced by the AI service; stored raw result/evidence must not be normalized first.
  if (sha256Hex(canonicalJson({ result: artifact.result, evidence: artifact.evidence })) !== ref.content_hash)
    fail('ARTIFACT_HASH_MISMATCH', 'Stored artifact content changed');
  return artifact;
}

/** Validate all tasks before any enqueue. Returns internal draft work only. */
export async function submitCampaignPlan(deps: { repo: PlanRepository; allowSynthetic?: boolean },
  workspaceId: string, body: unknown) {
  const parsed = artifactRefSchema.safeParse(body);
  if (!parsed.success) fail('INVALID_ARTIFACT_REF', 'Expected a versioned plan artifact reference');
  const ref = parsed.data;
  if (ref.role !== 'growth_lead') fail('INVALID_ROLE', 'Expected Growth Lead artifact');
  const stored = await resolve(deps.repo, workspaceId, ref);
  const checked = planSchema.safeParse(stored.result);
  if (!checked.success) fail('INVALID_PLAN', 'Plan schema/role/tool/approval validation failed');
  const plan = checked.data;
  const context = await deps.repo.loadContext(workspaceId);
  if (!context) fail('MISSING_CONTEXT', 'Backend context is unavailable');
  if (plan.workspace_id !== workspaceId) fail('TENANT_SCOPE_VIOLATION', 'Foreign plan');
  if (plan.context_snapshot_id !== context.snapshot_id || ref.context_snapshot_id !== context.snapshot_id ||
      plan.profile_version !== context.profile_version || plan.input_version !== ref.version)
    fail('STALE_CONTEXT', 'Rebuild plan against current snapshot/profile/version');
  if (plan.synthetic && !deps.allowSynthetic) fail('SYNTHETIC_NOT_ALLOWED', 'Mock plan requires explicit sandbox mode');
  if (plan.status !== 'proposed' || plan.missing_facts.length || !plan.selected_opportunity)
    fail('PLAN_BLOCKED', 'Resolve missing facts before enqueue');
  if (plan.research_artifact.role !== 'research' || plan.research_artifact.context_snapshot_id !== context.snapshot_id)
    fail('INVALID_RESEARCH', 'Research role/snapshot mismatch');
  const research = await resolve(deps.repo, workspaceId, plan.research_artifact);
  const brief = research.result as { workspace_id?: string; context_snapshot_id?: string;
    profile_version?: number; status?: string; findings?: unknown[]; missing_facts?: unknown[]; synthetic?: boolean };
  if (brief.workspace_id !== workspaceId || brief.context_snapshot_id !== context.snapshot_id ||
      brief.profile_version !== context.profile_version || brief.status !== 'ready_for_handoff' ||
      brief.missing_facts?.length || !brief.findings?.some(f => equal(f, plan.selected_opportunity)) ||
      (brief.synthetic && !plan.synthetic)) fail('INVALID_RESEARCH', 'Selected opportunity differs from trusted research');
  const evidence = plan.selected_opportunity.evidence;
  if (!context.approved_sources.some(s => s.source_id === evidence.source_id && s.version === evidence.source_version))
    fail('SOURCE_NOT_APPROVED', 'Research source is revoked or has a new version');
  if (plan.tasks.length !== 2 || new Set(plan.tasks.map(t => t.task_id)).size !== 2 ||
      new Set(plan.tasks.map(t => t.role)).size !== 2) fail('INVALID_TASKS', 'Expected unique SEO and social tasks');
  const seo = plan.tasks.find(t => t.role === 'seo')!;
  const social = plan.tasks.find(t => t.role === 'content')!;
  if (seo.operation !== 'seo.local_draft' || seo.brief.deliverable !== 'seo_article_draft' || seo.depends_on.length ||
      social.operation !== 'content.repurpose' || social.brief.deliverable !== 'social_pack_draft' ||
      !equal(social.depends_on, [seo.task_id])) fail('INVALID_DEPENDENCIES', 'Expected SEO then social; cycles/unknown tasks rejected');
  for (const task of plan.tasks) {
    if (plan.contract_version === 'growth-lead-plan-v2' && (!task.deadline || Date.parse(task.deadline) <= Date.now()))
      fail('INVALID_DEADLINE', 'New plans require future task deadlines');
    if (!equal(task.dependency_artifact_from, task.depends_on) ||
        !equal(task.input_artifact_refs, [plan.research_artifact])) fail('INVALID_HANDOFF', 'Task artifact dependencies differ');
    if (task.brief.topic !== plan.selected_opportunity.topic || !task.brief.audience.length || !task.brief.offer.length ||
        !task.brief.cta?.trim() || task.brief.audience_fit !== plan.selected_opportunity.audience_fit ||
        task.brief.offer_fit !== plan.selected_opportunity.offer_fit) fail('INVALID_BRIEF', 'Brief must preserve research fit, audience, offer and CTA');
  }
  if (plan.contract_version === 'growth-lead-plan-v2') {
    const score = plan.opportunity_score;
    if (!score) fail('INVALID_SCORE', 'New plans require transparent estimated score metadata');
    const factors = Object.values(score.factors);
    const expected = factors.every(x => x !== null) ? factors.reduce<number>((acc, x) => acc * x!, 1) : null;
    if (score.score !== expected || score.label !== (expected === null ? 'insufficient_data' : 'estimated'))
      fail('INVALID_SCORE', 'Opportunity score must equal the declared factor product');
  }
  return deps.repo.accept(plan, context);
}
