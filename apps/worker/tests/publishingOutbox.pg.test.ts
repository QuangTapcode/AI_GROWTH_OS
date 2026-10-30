import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CmsPublisher, PublisherRegistry, type CmsPublishRequest, type CmsPublishResult } from '../src/publish/CmsPublisher';
import { PublishingOutboxRunner } from '../src/publish/PublishingOutboxRunner';

/**
 * PublishingOutboxRunner against the real schema. The runner claims any pending
 * publishing event, so it only ever runs against its own disposable database.
 * Run: RUN_PUBLISH_DB=1 node --env-file=../api/.env.local node_modules/vitest/vitest.mjs run tests/publishingOutbox.pg.test.ts
 */

/** Same rule as the API (lib/hash.ts): sha256 of key-sorted JSON of {result, evidence}. */
function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, sort(x)]))
    : v;
  return JSON.stringify(sort(value));
}
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

class FakeFacebook extends CmsPublisher {
  channel = 'Facebook' as const;
  requests: CmsPublishRequest[] = [];
  async publish(req: CmsPublishRequest): Promise<CmsPublishResult> {
    this.requests.push(req);
    return { success: true, externalPostId: `fb_post_${this.requests.length}`, publishedAt: new Date() };
  }
  async reconcile(externalPostId: string): Promise<CmsPublishResult> {
    return { success: false, externalPostId, errorCode: 'POST_NOT_FOUND' };
  }
}

describe.skipIf(process.env.RUN_PUBLISH_DB !== '1')('publishing outbox on disposable PostgreSQL', () => {
  const name = `publish_test_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const workspace = randomUUID(), owner = randomUUID(), snapshot = randomUUID();
  let admin: Pool, db: Pool, channel: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    delete process.env.API_BASE_URL; // no HTTP gateway: the runner's own checks are under test
    const url = new URL(process.env.DATABASE_URL);
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Local DB only');
    admin = new Pool({ connectionString: url.href });
    await admin.query(`CREATE DATABASE "${name}"`);
    url.pathname = '/' + name;
    db = new Pool({ connectionString: url.href });
    const directory = resolve('../../database/migrations');
    for (const file of readdirSync(directory).filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort())
      await db.query(readFileSync(resolve(directory, file), 'utf8'));
    await db.query('INSERT INTO users(id,email,full_name) VALUES($1,$2,$3)', [owner, `${owner}@example.test`, 'Synthetic publish owner']);
    await db.query('INSERT INTO workspaces(id,name,slug) VALUES($1,$2,$3)', [workspace, 'Synthetic publish test', workspace]);
    await db.query("INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [workspace, owner]);
    await db.query("INSERT INTO knowledge_contexts(snapshot_id,workspace_id,profile_version,profile,snapshot) VALUES($1,$2,1,'{}','{}')", [snapshot, workspace]);
    channel = (await db.query("INSERT INTO channels(workspace_id,platform_name,channel_identifier) VALUES($1,'facebook','page-1') RETURNING id", [workspace])).rows[0].id;
  }, 60000);

  afterAll(async () => {
    if (db) await db.end();
    if (admin) {
      if (/^publish_test_\d+_[a-f0-9]{8}$/.test(name)) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });

  /** An approved Content artifact scheduled for Facebook exactly as API automation does it. */
  async function scheduleFacebookJob(text = 'Cafés in An Thuong have reliable Wi-Fi.') {
    const artifact = randomUUID();
    const result = { facebook: { text }, caption: text, synthetic: false };
    const evidence = [{ chunk_id: randomUUID(), quote: text }];
    const hash = sha256(canonicalJson({ result, evidence }));
    await db.query(
      `INSERT INTO content_artifacts(id,workspace_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
       VALUES($1,$2,1,$3,$4,'content','content.repurpose','ai_result','Synthetic post','ai_run_store',$5,$6)`,
      [artifact, workspace, hash, snapshot, JSON.stringify({ result }), JSON.stringify(evidence)]);
    const approval = (await db.query(
      `INSERT INTO approvals(workspace_id,target_type,target_id,target_version,target_hash,status,decision,actor_id,actor_role)
       VALUES($1,'artifact',$2,1,$3,'approved','approve',$4,'owner') RETURNING id`, [workspace, artifact, hash, owner])).rows[0].id;
    const content = (await db.query(
      `INSERT INTO contents (workspace_id,title,body_markdown,type,status,created_by,approved_by,current_version,content_hash,artifact_id)
       VALUES($1,'Synthetic post',$2,'social_post','approved','ai',$3,1,$4,$5) RETURNING id`, [workspace, text, owner, hash, artifact])).rows[0].id;
    const job = (await db.query(
      `INSERT INTO publishing_jobs(content_id,channel_id,scheduled_for,status,workspace_id,artifact_id,approval_id,mode,created_by)
       VALUES($1,$2,now(),'scheduled',$3,$4,$5,'live',$6) RETURNING id`, [content, channel, workspace, artifact, approval, owner])).rows[0].id;
    await db.query(
      `INSERT INTO outbox_events(workspace_id,event_type,dedup_key,payload) VALUES($1,'publishing.scheduled',$2,$3)`,
      [workspace, `publish:${job}`, JSON.stringify({ job_id: job, artifact_id: artifact, approval_id: approval, channel_id: channel, mode: 'live' })]);
    return { job, artifact, approval, content };
  }

  function runner(publisher: CmsPublisher) {
    const registry = new PublisherRegistry();
    registry.register('Facebook', publisher);
    return new PublishingOutboxRunner(db, registry);
  }

  it('publishes an approved automated Facebook job scheduled by the API', async () => {
    const { job } = await scheduleFacebookJob();
    const facebook = new FakeFacebook();

    expect(await runner(facebook).runOnce()).toBe('published');

    expect(facebook.requests).toHaveLength(1);
    const row = (await db.query('SELECT status, external_post_id FROM publishing_jobs WHERE id=$1', [job])).rows[0];
    expect(row).toEqual({ status: 'published', external_post_id: 'fb_post_1' });
  });

  it('does not publish a post whose stored text changed after approval', async () => {
    const { job, artifact } = await scheduleFacebookJob('Cafés in An Thuong have quiet corners.');
    await db.query(`UPDATE content_artifacts SET payload = jsonb_set(payload, '{result,facebook,text}', '"Best cafés in Vietnam!"') WHERE id=$1`, [artifact]);
    const facebook = new FakeFacebook();

    expect(await runner(facebook).runOnce()).toBe('failed');

    expect(facebook.requests).toHaveLength(0);
    const row = (await db.query('SELECT status, error_message FROM publishing_jobs WHERE id=$1', [job])).rows[0];
    expect(row.status).toBe('failed');
    expect(row.error_message).toContain('CONTENT_HASH_MISMATCH');
  });

  it('a second job for an artifact already on the Page reuses that post instead of posting again', async () => {
    const first = await scheduleFacebookJob('Cafés near My Khe open early.');
    const facebook = new FakeFacebook();
    await runner(facebook).runOnce();
    const posted = (await db.query('SELECT external_post_id FROM publishing_jobs WHERE id=$1', [first.job])).rows[0].external_post_id;
    const retry = (await db.query(
      `INSERT INTO publishing_jobs(content_id,channel_id,scheduled_for,status,workspace_id,artifact_id,approval_id,mode,created_by)
       VALUES($1,$2,now(),'scheduled',$3,$4,$5,'live',$6) RETURNING id`,
      [first.content, channel, workspace, first.artifact, first.approval, owner])).rows[0].id;
    await db.query(`INSERT INTO outbox_events(workspace_id,event_type,dedup_key,payload) VALUES($1,'publishing.scheduled',$2,$3)`,
      [workspace, `publish:${retry}`, JSON.stringify({ job_id: retry })]);

    expect(await runner(facebook).runOnce()).toBe('published');

    expect(facebook.requests).toHaveLength(1);
    const row = (await db.query('SELECT status, external_post_id FROM publishing_jobs WHERE id=$1', [retry])).rows[0];
    expect(row).toEqual({ status: 'published', external_post_id: posted });
  });
});
