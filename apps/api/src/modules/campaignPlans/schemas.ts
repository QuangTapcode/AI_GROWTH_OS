import { z } from 'zod';

export const artifactRefSchema = z.object({
  artifact_id: z.string().uuid(), workspace_id: z.string().uuid(), version: z.number().int().positive(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/), context_snapshot_id: z.string().uuid(),
  role: z.enum(['research', 'growth_lead']), storage: z.literal('ai_run_store'),
}).strict();
const text = z.string().min(1).max(2000);
const evidenceSchema = z.object({
  source_id: z.string().uuid(), source_version: z.number().int().positive(), chunk_id: text,
  locator: z.string().nullable(), quote: text, source_url: z.string().url(),
  license: z.string().nullable(), attribution: z.string().nullable(),
}).strict();
const findingSchema = z.object({
  topic: text, audience_fit: text, offer_fit: text, rationale: text, evidence: evidenceSchema,
  url: z.string().url(), fetched_at: z.string().datetime({ offset: true }),
  confidence: z.literal('hypothesis'), demand_estimate: z.null(),
}).strict();
export const planSchema = z.object({
  contract_version: z.literal('growth-lead-plan-v1'), plan_id: z.string().uuid(),
  workspace_id: z.string().uuid(), input_version: z.number().int().positive(),
  profile_version: z.number().int().positive().nullable(), context_snapshot_id: z.string().uuid(),
  status: z.enum(['proposed', 'blocked']), objective: text,
  selection_method: z.literal('model_selection_from_grounded_research'),
  selected_opportunity: findingSchema.nullable(), research_artifact: artifactRefSchema,
  tasks: z.array(z.object({
    task_id: z.string().uuid(), role: z.enum(['seo', 'content']),
    operation: z.enum(['seo.local_draft', 'content.repurpose']),
    tools: z.array(z.enum(['knowledge.read', 'content.draft'])).min(1).max(2),
    depends_on: z.array(z.string().uuid()).max(2),
    input_artifact_refs: z.array(artifactRefSchema).min(1).max(2),
    dependency_artifact_from: z.array(z.string().uuid()).max(2),
    brief: z.object({
      topic: text, audience: z.array(text).max(20), offer: z.array(text).max(100),
      audience_fit: text, offer_fit: text, intent: z.literal('informational'),
      deliverable: z.enum(['seo_article_draft', 'social_pack_draft']), cta: text.nullable(),
      acceptance: z.array(text).min(1).max(10),
    }).strict(), requires_human_approval: z.literal(true),
  }).strict()).max(2),
  missing_facts: z.array(text).max(100), requires_human_approval: z.literal(true),
  applied: z.literal(false), synthetic: z.boolean(),
}).strict();
export type ArtifactRef = z.infer<typeof artifactRefSchema>;
export type CampaignPlan = z.infer<typeof planSchema>;
