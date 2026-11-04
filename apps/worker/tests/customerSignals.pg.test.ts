import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { customerSignals } from '../src/workflow/PlanOutboxRunner';

/** What Research hears from customers. Run: RUN_PUBLISH_DB=1 node --env-file=../api/.env.local node_modules/vitest/vitest.mjs run tests/customerSignals.pg.test.ts */
describe.skipIf(process.env.RUN_PUBLISH_DB !== '1')('customer signals on disposable PostgreSQL', () => {
  const name = `publish_test_${Date.now()}_${randomUUID().slice(0, 8)}`;
  let admin: Pool, db: Pool;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const url = new URL(process.env.DATABASE_URL);
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Local DB only');
    admin = new Pool({ connectionString: url.href });
    await admin.query(`CREATE DATABASE "${name}"`);
    url.pathname = '/' + name;
    db = new Pool({ connectionString: url.href });
    const directory = resolve('../../database/migrations');
    for (const file of readdirSync(directory).filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort())
      await db.query(readFileSync(resolve(directory, file), 'utf8'));
  }, 60000);

  afterAll(async () => {
    if (db) await db.end();
    if (admin) {
      if (/^publish_test_\d+_[a-f0-9]{8}$/.test(name)) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });

  async function workspace() {
    const id = randomUUID();
    await db.query("INSERT INTO workspaces(id,name,slug) VALUES($1,'Synthetic signals',$2)", [id, id]);
    return id;
  }
  const message = (ws: string, content: string, at: string, platform = 'facebook_message') => db.query(
    `INSERT INTO community_messages(workspace_id,platform,external_id,author_name,content,received_at) VALUES($1,$2,$3,'Customer',$4,$5)`,
    [ws, platform, randomUUID(), content, at]);
  const lead = (ws: string, topic: string, at: string, extra: { utm_source?: string; context?: object } = {}) => db.query(
    `INSERT INTO leads(workspace_id,site_id,idempotency_key,payload_hash,contact_email,consent_policy_version,interest_topic,captured_at,utm_source,context)
     VALUES($1,'site',$2,'hash','lead@example.test','v1',$3,$4,$5,$6)`,
    [ws, randomUUID(), topic, at, extra.utm_source ?? null, JSON.stringify(extra.context ?? {})]);
  const until = '2026-06-30T00:00:00Z';

  it('the newest questions win when there are more than Research can take', async () => {
    const ws = await workspace();
    for (let n = 10; n < 30; n++) await message(ws, `Question number ${n}?`, `2026-06-${n - 9 < 10 ? '0' : ''}${n - 9}T00:00:00Z`);
    const signals = await customerSignals(db, ws, until);
    expect(signals).toHaveLength(15);
    expect(signals[0]).toBe('Question number 29?');
    expect(signals).not.toContain('Question number 10?');
  });

  it('the same question counts once, and a website lead adds what it was interested in', async () => {
    const ws = await workspace();
    await message(ws, 'Where can I rent a flat?', '2026-06-01T00:00:00Z');
    await message(ws, 'Where can I rent a flat?', '2026-06-02T00:00:00Z');
    await lead(ws, 'Long stay housing', '2026-06-03T00:00:00Z');
    expect(await customerSignals(db, ws, until)).toEqual(['Long stay housing', 'Where can I rent a flat?']);
  });

  it('test data and the fixed topic of a community lead say nothing about demand', async () => {
    const ws = await workspace();
    await lead(ws, 'Synthetic topic', '2026-06-03T00:00:00Z', { context: { synthetic: 'true' } });
    await lead(ws, 'Housing & Community Consultation', '2026-06-03T00:00:00Z', { utm_source: 'community' });
    expect(await customerSignals(db, ws, until)).toEqual([]);
  });

  it('a greeting is too short to be a signal, and later or foreign messages are not used', async () => {
    const ws = await workspace(), other = await workspace();
    await message(ws, 'hi', '2026-06-01T00:00:00Z');
    await message(ws, 'Asked after the task was created?', '2026-07-01T00:00:00Z');
    await message(other, 'Asked in another workspace?', '2026-06-01T00:00:00Z');
    expect(await customerSignals(db, ws, until)).toEqual([]);
  });
});
