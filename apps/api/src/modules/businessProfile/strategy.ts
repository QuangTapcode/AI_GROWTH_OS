import { z } from 'zod';

export const priorityTopicSchema = z.object({
  id: z.string().regex(/^PT-0[1-5]$/),
  title: z.string().trim().min(1).max(100),
  priority: z.enum(['high', 'medium']),
  query_terms: z.array(z.string().trim().min(1).max(60)).min(1).max(3),
  journey_stage: z.enum(['discover', 'prepare', 'arrive', 'settle', 'connect']),
  objective_metrics: z.array(z.string().trim().min(1).max(50)).min(1).max(5),
  verification: z.array(z.enum(['approved_sources', 'recheck_dynamic_facts', 'official_sources_for_sensitive_topics', 'confirmed_capability_before_promotion', 'event_details'])).min(1).max(5),
}).strict();

export const researchStrategySchema = z.object({
  version: z.literal('tripc-strategy-v1'),
  status: z.literal('operator_strategy_not_measured_demand'),
  source_document: z.object({ filename: z.string().min(1).max(255), sha256: z.string().regex(/^[a-f0-9]{64}$/), reviewed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict(),
  topics: z.array(priorityTopicSchema).min(1).max(5).refine(topics => new Set(topics.map(t => t.id)).size === topics.length, 'Topic IDs must be unique'),
  competitor_references: z.array(z.object({ name: z.string().min(1).max(100), url: z.string().url().max(255),
    lesson: z.string().min(1).max(200), status: z.literal('document_observation_requires_recheck') }).strict()).max(3),
}).strict();

export type ResearchStrategy = z.infer<typeof researchStrategySchema>;
export const strategyAlignmentSchema = priorityTopicSchema.omit({ id: true, query_terms: true }).extend({
  topic_id: priorityTopicSchema.shape.id, basis: z.literal('operator_strategy_not_measured_demand'),
}).strict();

/** Compact, version-pinned context. Competitors are references, never approved source facts. */
export function agentProfile(row: Record<string, any>, workspaceId: string) {
  const strategy = row.research_strategy ? researchStrategySchema.parse(row.research_strategy) : null;
  return { workspace_id: workspaceId, company: row.company_name, version: row.version,
    audiences: row.target_audiences ?? [], locations: row.target_locations ?? [], products: row.products_services ?? [],
    voice: row.brand_voice, overview: row.overview,
    competitors: row.competitors ?? [], topic_priority: strategy?.topics.map(t => t.title) ?? [],
    research_strategy: strategy,
  };
}
