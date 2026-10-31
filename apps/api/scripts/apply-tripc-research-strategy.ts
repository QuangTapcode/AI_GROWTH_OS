import { readFileSync } from 'node:fs';
import path from 'node:path';
import pool from '../src/lib/db';
import { applyTripcResearchStrategy } from '../src/modules/businessProfile/applyStrategy';
import { PgPlanRepository } from '../src/modules/campaignPlans/pgRepository';

async function main() {
  const workspaceId = process.argv[2] ?? '10000000-0000-4000-8000-000000000001';
  const strategy = JSON.parse(readFileSync(path.resolve(__dirname, '../../../config/workspaces/tripc-research-strategy.json'), 'utf8'));
  const applied = await applyTripcResearchStrategy(pool, workspaceId, strategy);
  const current = (await pool.query('SELECT snapshot_id FROM knowledge_contexts WHERE workspace_id=$1 AND profile_version=$2 AND current', [workspaceId, applied.profile_version])).rows[0];
  const contextId = current?.snapshot_id ?? (await new PgPlanRepository(pool).issueContext(workspaceId)).context_snapshot_id;
  console.log(JSON.stringify({ ...applied, workspace_id: workspaceId, context_snapshot_id: contextId,
    topics: strategy.topics.map((t: { id: string }) => t.id), competitor_references: strategy.competitor_references.length,
    confirmed_services_changed: false, kpi_targets_changed: false }));
}
main().catch(error => { console.error('Strategy import failed:', error instanceof Error ? error.message : 'unknown error'); process.exitCode = 1; }).finally(() => pool.end());
