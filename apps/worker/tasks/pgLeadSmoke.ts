/** PG smoke cho LeadIntakeService — chạy tay khi có DB thật, không chạy trong CI. */
import { Pool } from 'pg';
import { LeadIntakeService } from '../src/leads/LeadIntakeService.js';
import { PgLeadStore } from '../src/leads/PgLeadStore.js';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('SKIP: no DATABASE_URL');
    return;
  }
  const ws = process.argv[2] ?? '96c0eab9-8a52-5207-abdc-4623fa5f3514';
  const pool = new Pool({ connectionString: url });
  try {
    const svc = new LeadIntakeService(new PgLeadStore(pool));
    const email = `pg_smoke_${Date.now()}@example.com`;
    const first = await svc.intake({
      workspaceId: ws, contactEmail: email,
      utmSource: 'fb', utmMedium: 'social', utmCampaign: 'smoke', consent: true,
    });
    console.log('first:', first.success, first.duplicate, first.lead?.leadId);
    const second = await svc.intake({
      workspaceId: ws, contactEmail: email,
      utmSource: 'fb', utmMedium: 'social', utmCampaign: 'smoke', consent: true,
    });
    console.log('second:', second.success, second.duplicate, second.lead?.leadId);
    console.log('dedup_ok:', first.lead?.leadId === second.lead?.leadId);
    const list = await svc.listLeads(ws);
    console.log('list_count:', list.length);
  } finally {
    await pool.end();
  }
}

void main();
