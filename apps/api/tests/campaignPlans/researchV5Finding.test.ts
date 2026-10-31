import { describe, expect, it } from 'vitest';
import { planSchema } from '../../src/modules/campaignPlans/schemas';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ref = (role: 'research' | 'growth_lead') => ({ artifact_id: id(1), workspace_id: id(2), version: 1, content_hash: 'a'.repeat(64),
  context_snapshot_id: id(3), role, storage: 'ai_run_store' as const });
const finding = {
  topic: 'Quiet areas for remote workers', audience_fit: 'Fits expats.', offer_fit: 'Matches housing.', rationale: 'The excerpt says so.',
  evidence: { source_id: id(4), source_version: 2, chunk_id: id(5), locator: 'paragraph:5', quote: 'Son Tra offers a quieter environment for remote workers.',
    source_url: 'https://tripc.ai/blog/da-nang-workcation-digital-nomad-guide', license: 'TripC first-party content', attribution: 'TripC' },
  url: 'https://tripc.ai/blog/da-nang-workcation-digital-nomad-guide', fetched_at: '2026-10-25T17:46:00+00:00',
  confidence: 'hypothesis', demand_estimate: null, keywords: ['remote work'], user_need: 'Find a quiet base.',
  evidence_updated: null,
  trend_signals: [{ signal_id: id(6), query: 'Da Nang coworking expats', rank: 6, title: 'Da Nang Coworking Guide', url: 'https://example.com/guide',
    domain: 'example.com', observed_at: '2026-10-25T17:45:12.5Z', previous_rank: 9, is_new: false }],
};
const plan = (selected: unknown) => ({
  contract_version: 'growth-lead-plan-v2', plan_id: id(7), workspace_id: id(2), input_version: 1, profile_version: 1, context_snapshot_id: id(3),
  status: 'proposed', objective: 'Prepare grounded drafts', selection_method: 'model_selection_from_grounded_research',
  selected_opportunity: selected, research_artifact: ref('research'), tasks: [], missing_facts: [],
  requires_human_approval: true, applied: false, synthetic: false,
});

describe('plan schema accepts research-v5 findings', () => {
  it('keeps trend signals and dated evidence from Research', () => {
    const parsed = planSchema.safeParse(plan(finding));
    expect(parsed.success ? 'ok' : parsed.error.issues.map((i) => i.path.join('.'))).not.toEqual(
      expect.arrayContaining([expect.stringContaining('selected_opportunity')]));
  });
  it('still rejects unknown finding fields', () => {
    const parsed = planSchema.safeParse(plan({ ...finding, invented: 'x' }));
    expect(parsed.success).toBe(false);
  });
});
