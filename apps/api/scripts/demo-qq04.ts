import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MockPlanRepository } from '../src/modules/campaignPlans/mockRepository';
import { createCampaignPlanRoutes } from '../src/modules/campaignPlans/routes';

async function main() {
  const directory = resolve(process.cwd(), '../../qa/evidence/qq04');
  const fixture = JSON.parse(readFileSync(resolve(directory, 'mock-report.json'), 'utf8'));
  const repo = new MockPlanRepository();
  for (const output of [fixture.research, fixture.plan])
    repo.seedArtifact({ ref: output.artifact, result: output.result, evidence: output.evidence });
  const workspaceId = fixture.plan.result.workspace_id;
  repo.seedContext(workspaceId, { snapshot_id: fixture.plan.result.context_snapshot_id,
    profile_version: 1, approved_sources: fixture.research_request.approved_source_versions });
  const routes = createCampaignPlanRoutes({ repo, allowSynthetic: true });
  const first = await routes.handleSubmit(workspaceId, fixture.plan.artifact);
  const retry = await routes.handleSubmit(workspaceId, fixture.plan.artifact);
  if (first.status !== 201 || retry.status !== 200 || repo.records.length !== 1) throw new Error('Demo failed');
  const report = { mode: 'mock', synthetic: true, storage: 'in-memory mock', queue: 'outbox mock only',
    first, retry, records: repo.records };
  writeFileSync(resolve(directory, 'backend-mock-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS: plan accepted; SEO ready, social blocked; retry deduplicated.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
