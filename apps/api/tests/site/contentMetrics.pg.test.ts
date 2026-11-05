import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureMeasurementArtifacts } from '../../src/modules/site/measurement';

describe.skipIf(process.env.RUN_AUTOMATION_DB !== '1')('per-article measurement (disposable PostgreSQL)', () => {
  const name = `content_metrics_test_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const workspace = randomUUID(), snapshot = randomUUID();
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
    await db.query("INSERT INTO workspaces(id,name,slug) VALUES($1,'Synthetic metrics test',$2)", [workspace, workspace]);
    await db.query("INSERT INTO knowledge_contexts(snapshot_id,workspace_id,profile_version,profile,snapshot) VALUES($1,$2,1,'{}','{}')", [snapshot, workspace]);
  }, 60000);

  afterAll(async () => {
    if (db) await db.end();
    if (admin) {
      if (/^content_metrics_test_\d+_[a-f0-9]{8}$/.test(name)) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });

  async function post(slug: string, title: string) {
    return (await db.query(
      `INSERT INTO contents (workspace_id,title,body_markdown,type,status,created_by,published_at,site_id,slug)
       VALUES($1,$2,'Body','blog_post','published','ai',now(),'tripc-pilot',$3) RETURNING id`, [workspace, title, slug])).rows[0].id as string;
  }
  const event = (content: string | null, type: string, session: string, internal = false, age = '1 hour') => db.query(
    `INSERT INTO site_events (workspace_id,site_id,content_id,event_type,session_id,path,internal,occurred_at)
     VALUES($1,'tripc-pilot',$2,$3,$4,'/posts/x',$5,now()-$6::interval)`, [workspace, content, type, session, internal, age]);

  it('reports views and CTA clicks per article, most clicked first, without internal or old visits', async () => {
    const food = await post('street-food', 'Street Food in Da Nang');
    const cafes = await post('cafes', 'Cafes for Remote Work');
    await post('unread', 'Nobody Read This');
    for (const session of ['a', 'b', 'c']) await event(cafes, 'page_view', session);
    await event(food, 'page_view', 'a');
    await event(food, 'page_view', 'b');
    await event(food, 'cta_click', 'a');
    await event(food, 'page_view', 'qa-preview', true);
    await event(food, 'cta_click', 'qa-preview', true);
    await event(cafes, 'page_view', 'long-ago', false, '30 days');

    const { metrics_artifact_id: id } = await ensureMeasurementArtifacts(db, workspace, snapshot, 0);
    const result = (await db.query('SELECT payload FROM content_artifacts WHERE id=$1', [id])).rows[0].payload.result;

    expect(result.content_metrics).toEqual([
      { slug: 'street-food', title: 'Street Food in Da Nang', page_views: 2, cta_clicks: 1 },
      { slug: 'cafes', title: 'Cafes for Remote Work', page_views: 3, cta_clicks: 0 },
    ]);
  });
});
