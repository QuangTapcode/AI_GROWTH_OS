import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tickAutomation } from '../../src/modules/campaignPlans/automation';
import { persistCommunityLead } from '../../src/modules/community/leads';
import { CommunityService } from '../../src/modules/community/service';
import { ensureBaselineArtifact, ensureMeasurementArtifacts } from '../../src/modules/site/measurement';

/**
 * What the scheduler and the ledger do with agent results on a database: Community leads (AC-COM-03) and measurement windows (AC-PER-01).
 * `it.fails` marks a requirement not met yet; the name after GAP is in docs/reports/AGENT-ACCEPTANCE-2026-11-04.md.
 * Run on its own disposable database: RUN_AUTOMATION_DB=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/acceptance/agents.pg.test.ts
 */
describe.skipIf(process.env.RUN_AUTOMATION_DB !== '1')('agent results on disposable PostgreSQL', () => {
  const name = `automation_test_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const owner = randomUUID();
  let admin: Pool, db: Pool;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const url = new URL(process.env.DATABASE_URL);
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Local DB only');
    admin = new Pool({ connectionString: url.href });
    await admin.query(`CREATE DATABASE "${name}"`);
    url.pathname = `/${name}`;
    db = new Pool({ connectionString: url.href });
    const directory = resolve('../../database/migrations');
    for (const file of readdirSync(directory).filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort())
      await db.query(readFileSync(resolve(directory, file), 'utf8'));
    await db.query('INSERT INTO users(id,email,full_name) VALUES($1,$2,$3)', [owner, `${owner}@example.test`, 'Synthetic owner']);
  }, 60000);

  afterAll(async () => {
    if (db) await db.end();
    if (admin) {
      if (/^automation_test_\d+_[a-f0-9]{8}$/.test(name)) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });

  async function newWorkspace() {
    const ws = randomUUID(), ctx = randomUUID();
    await db.query("INSERT INTO workspaces(id,name,slug) VALUES($1,'Synthetic community',$2)", [ws, ws]);
    await db.query("INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [ws, owner]);
    await db.query("INSERT INTO knowledge_contexts(snapshot_id,workspace_id,profile_version,profile,snapshot) VALUES($1,$2,1,'{}',$3)",
      [ctx, ws, JSON.stringify({ sources: [{ source_id: randomUUID(), version: 1 }] })]);
    return { ws, ctx };
  }

  /** A reply with a lead proposal, as the agent leaves it, linked to the message it answers. */
  async function leadFrom(content: string, proposal: Record<string, unknown>) {
    const { ws, ctx } = await newWorkspace();
    const task = randomUUID(), artifact = randomUUID();
    await db.query(`INSERT INTO workflow_tasks(id,workspace_id,role,operation,status,input_version,context_snapshot_id,payload)
      VALUES($1,$2,'community','community.response','queued',1,$3,'{}')`, [task, ws, ctx]);
    await db.query(`INSERT INTO content_artifacts(id,workspace_id,task_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
      VALUES($1,$2,$3,1,$4,$5,'community','community.response','ai_result','Synthetic','ai_run_store',$6,'[]')`,
      [artifact, ws, task, artifact.replace(/-/g, '').padEnd(64, '0'), ctx, JSON.stringify({ result: { reply: 'A person will follow up.', lead_proposal: proposal } })]);
    await db.query(`INSERT INTO community_messages(workspace_id,platform,author_name,content,status,task_id) VALUES($1,'manual','Customer',$2,'queued',$3)`, [ws, content, task]);
    const client = await db.connect();
    try { await persistCommunityLead(client, ws, artifact, owner); } finally { client.release(); }
    return (await db.query('SELECT contact_email,interest_topic,lead_owner,utm_source,lead_status FROM leads WHERE workspace_id=$1', [ws])).rows[0];
  }

  const proposal = { intent: 'request_information', status: 'proposed', owner: null, requires_consent: true, persisted: false };

  it('a person approving a lead keeps what they gave and becomes responsible for it', async () => {
    const lead = await leadFrom('I want to rent a flat, write to me', { ...proposal, contact: { email: 'real.person@example.test' } });
    expect(lead).toMatchObject({ contact_email: 'real.person@example.test', lead_owner: owner, utm_source: 'community', lead_status: 'New' });
  });

  // GAP-COM-7: with no contact details the lead gets a made-up community.<id>@tripc.internal, which sales cannot tell from a real one by its status.
  it.fails('a lead with no contact details does not get an invented address', async () => {
    const lead = await leadFrom('I want to rent a flat', proposal);
    expect(lead.contact_email).not.toMatch(/@tripc\.internal$/);
  });

  // GAP-COM-7: interest_topic is the same constant for every Community lead.
  it.fails('a lead says what the person asked about', async () => {
    const lead = await leadFrom('Do you know a coworking space with a monthly pass?', { ...proposal, contact: { email: 'real.person@example.test' } });
    expect(lead.interest_topic).toMatch(/coworking/i);
  });

  async function waitingForAPerson(result: Record<string, unknown>) {
    const { ws, ctx } = await newWorkspace();
    await db.query(`INSERT INTO agent_automation(workspace_id,actor_id,enabled,auto_approve_outputs,next_run_at) VALUES($1,$2,true,$3,now()+interval '1 day')`,
      [ws, owner, result.auto === true]);
    const task = randomUUID(), artifact = randomUUID();
    await db.query(`INSERT INTO workflow_tasks(id,workspace_id,role,operation,status,input_version,context_snapshot_id,payload)
      VALUES($1,$2,'community','community.response','queued',1,$3,'{}')`, [task, ws, ctx]);
    await db.query(`INSERT INTO content_artifacts(id,workspace_id,task_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
      VALUES($1,$2,$3,1,$4,$5,'community','community.response','ai_result','Synthetic','ai_run_store',$6,$7)`,
      [artifact, ws, task, artifact.replace(/-/g, '').padEnd(64, '0'), ctx, JSON.stringify({ result: { synthetic: false, ...result } }), JSON.stringify([{ quote: 'A source.' }])]);
    await db.query("UPDATE workflow_tasks SET status='awaiting_approval',result_ref=$2 WHERE id=$1", [task, artifact]);
    const message = (await db.query(`INSERT INTO community_messages(workspace_id,platform,author_name,author_contact,content,status,task_id)
      VALUES($1,'manual','Customer','real.person@example.test','How much is the rent? Write to me.','queued',$2) RETURNING id`, [ws, task])).rows[0].id;
    return { ws, ctx, task, message };
  }

  async function newContextIssued(ws: string, ctx: string) {
    await db.query('UPDATE knowledge_contexts SET current=false WHERE snapshot_id=$1', [ctx]);
    await db.query("INSERT INTO knowledge_contexts(snapshot_id,workspace_id,profile_version,profile,snapshot) VALUES($1,$2,1,'{}',$3)",
      [randomUUID(), ws, JSON.stringify({ sources: [{ source_id: randomUUID(), version: 1 }] })]);
  }

  // GAP-COM-9: seen on a copy of the real data: 15 of 25 messages, 3 of them leads who asked to be contacted, were cancelled by the
  // first new context and stayed 'queued' for good, with no lead stored and nobody told. Blog sync can issue a context any day.
  it.fails('a customer waiting for a person is not dropped when the knowledge context changes', async () => {
    const m = await waitingForAPerson({ status: 'insufficient_data', missing_facts: ['verified_fact:monthly_rent', 'verified_lead_owner_and_consent'],
      reply: 'A human needs to review it.', escalation_required: true, lead_proposal: proposal });
    await newContextIssued(m.ws, m.ctx);
    await tickAutomation(db, m.ws);
    const after = (await db.query(`SELECT m.status, t.status AS task FROM community_messages m LEFT JOIN workflow_tasks t ON t.id=m.task_id WHERE m.id=$1`, [m.message])).rows[0];
    const stillOpen = after.task === 'awaiting_approval' || after.status === 'received' || after.status === 'escalated';
    expect(stillOpen).toBe(true);
  });

  // GAP-COM-10: seen on a copy of the real data: "Can I book a room now?" got "You can book a room now..." and was marked replied by auto-approval.
  it.fails('with auto-approval on, a reply about a booking still waits for a person', async () => {
    const m = await waitingForAPerson({ auto: true, status: 'insufficient_data', missing_facts: ['verified_lead_owner_and_consent'],
      reply: 'You can book a room now.', escalation_required: true, lead_proposal: proposal });
    await tickAutomation(db, m.ws);
    expect((await db.query('SELECT status FROM workflow_tasks WHERE id=$1', [m.task])).rows[0].status).toBe('awaiting_approval');
  });

  // GAP-COM-8: the scheduler's path sends history; POST /community/messages with its default auto_enqueue does not.
  it.fails('a follow-up sent straight to the queue carries the same history as one picked up by the scheduler', async () => {
    const { ws, ctx } = await newWorkspace();
    await db.query(`INSERT INTO community_messages(workspace_id,platform,author_name,author_contact,content,status) VALUES($1,'manual','Customer','same-person','Where can I eat?','replied')`, [ws]);
    const { task_id } = await new CommunityService(db).receiveMessage(ws, owner, { platform: 'manual', author_name: 'Customer', author_contact: 'same-person', content: 'Which one suits a family?' });
    const task = (await db.query('SELECT payload FROM workflow_tasks WHERE id=$1 AND context_snapshot_id=$2', [task_id, ctx])).rows[0];
    expect(task.payload.input.history?.length).toBe(1);
  });

  it('a measurement in the same period reuses the current week while no baseline has been taken', async () => {
    const { ws, ctx } = await newWorkspace();
    const first = await ensureMeasurementArtifacts(db, ws, ctx, 24);
    expect((await ensureMeasurementArtifacts(db, ws, ctx, 24)).metrics_artifact_id).toBe(first.metrics_artifact_id);
  });

  // GAP-PERF-1: the baseline is stored as a metrics.snapshot too and is newer, so "latest" means the week before. Each round walks back
  // a week: seen in the real ledger on 29/10, reports reached 27/08-03/09 within one evening, and the second round reported zero visits.
  it('a measurement taken after its baseline still reads the current week', async () => {
    const { ws, ctx } = await newWorkspace();
    const first = await ensureMeasurementArtifacts(db, ws, ctx, 24);
    await ensureBaselineArtifact(db, ws, ctx, first.metrics_artifact_id);
    expect((await ensureMeasurementArtifacts(db, ws, ctx, 24)).metrics_artifact_id).toBe(first.metrics_artifact_id);
  });
});
