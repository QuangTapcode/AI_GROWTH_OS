import pool from '../src/lib/db';
import { PgPlanRepository } from '../src/modules/campaignPlans/pgRepository';

async function main() {
  const workspaceId = '10000000-0000-4000-8000-000000000001';
  const repo = new PgPlanRepository(pool);
  console.log('Issuing fresh knowledge context snapshot for workspace:', workspaceId);
  const context = await repo.issueContext(workspaceId);
  console.log('New snapshot_id:', context.context_snapshot_id);
  console.log('Approved sources count in snapshot:', context.approved_source_versions.length);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
