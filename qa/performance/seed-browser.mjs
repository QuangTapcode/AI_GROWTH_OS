import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { Pool } = require('pg');

export default async function seed() {
  const url = new URL(process.env.PERFORMANCE_TEST_DATABASE_URL ?? 'invalid:');
  if (!['localhost','127.0.0.1'].includes(url.hostname) || url.pathname !== '/performance_test') throw new Error('Dedicated local performance_test DB required');
  const db = new Pool({ connectionString: url.href });
  try {
    const directory = new URL('../../database/migrations/', import.meta.url);
    for (const file of readdirSync(directory).filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort())
      await db.query(readFileSync(new URL(file,directory),'utf8').replace(/^\uFEFF/,''));
    const workspace = 'f1000000-0000-4000-8000-000000000001', actor = '11111111-1111-4000-8000-000000000001';
    await db.query("INSERT INTO workspaces(id,name,slug) VALUES($1,'Performance browser fixture','performance-browser') ON CONFLICT(id) DO NOTHING", [workspace]);
    await db.query("INSERT INTO users(id,email,full_name) VALUES($1,'owner.performance@example.test','Performance Owner') ON CONFLICT(id) DO NOTHING", [actor]);
    await db.query("INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner') ON CONFLICT(workspace_id,user_id) DO NOTHING", [workspace,actor]);
    await db.query("INSERT INTO business_profiles(workspace_id,company_name) VALUES($1,'Performance fixture') ON CONFLICT(workspace_id) DO NOTHING", [workspace]);
    await db.query("UPDATE performance_experiments SET status='stopped',stopped_at=now() WHERE workspace_id=$1 AND status='running'", [workspace]);
  } finally { await db.end(); }
}
