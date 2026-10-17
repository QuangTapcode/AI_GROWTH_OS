import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pool from '../../../apps/api/src/lib/db';
import * as workspaces from '../../../apps/api/src/modules/workspaces/service';
import * as sources from '../../../apps/api/src/modules/sources/service';
import { PgPlanRepository } from '../../../apps/api/src/modules/campaignPlans/pgRepository';
import { submitCampaignPlan, type StoredArtifact } from '../../../apps/api/src/modules/campaignPlans/service';
import { approvePlanTask } from '../../../apps/api/src/modules/campaignPlans/approveTask';
import { acceptLearningTasks } from '../../../apps/api/src/modules/campaignPlans/learningTasks';
import { enqueueAiTask } from '../../../apps/api/src/modules/campaignPlans/aiTasks';
import { canonicalJson } from '../../../apps/api/src/lib/hash';
import { HttpAiAdapter } from '../../../apps/worker/src/adapters/HttpAiAdapter';
import { PlanOutboxRunner } from '../../../apps/worker/src/workflow/PlanOutboxRunner';

const mode = process.env.QQ_SIX_ROLE_MODE;
describe.skipIf(!mode)('QQ all: real PostgreSQL -> HTTP worker -> AI -> ledger -> approval', () => {
  let child: ChildProcess, directory: string, ai: HttpAiAdapter;
  beforeAll(async () => {
    if (!['fake', 'live'].includes(mode!)) throw new Error('QQ_SIX_ROLE_MODE must be fake or live');
    if (!/^qq_test_\d+_[0-9a-f]{6}$/.test(process.env.QQ_TEST_DATABASE ?? '')) throw new Error('Disposable DB required');
    directory = await mkdtemp(join(tmpdir(), 'qq-six-'));
    const server = createServer();
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    await new Promise<void>(r => server.close(() => r()));
    const token = randomUUID();
    child = spawn(process.env.QQ_PYTHON ?? 'python', ['-m', 'uvicorn', 'src.app.main:app', '--host', '127.0.0.1', '--port', String(port)], {
      cwd: resolve('../../services/ai'), windowsHide: true,
      env: { ...process.env, LLM_PROVIDER_MODE: mode, AI_RUN_STORE_PATH: join(directory, 'runs.sqlite3'), INTERNAL_AI_AUTH_TOKEN: token, PYTHONIOENCODING: 'utf-8' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let startup = '';
    let startupError: Error | undefined;
    child.on('error', error => { startupError = error; });
    child.stderr?.on('data', chunk => { startup = (startup + chunk).slice(-6000); });
    const baseUrl = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 300; i++) {
      if (startupError) throw startupError;
      try { if ((await fetch(baseUrl + '/healthz', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
      if (child.exitCode !== null) throw new Error(startup);
      await new Promise(r => setTimeout(r, 150));
    }
    if (!ready) throw new Error('AI startup failed: ' + startup);
    ai = new HttpAiAdapter({ baseUrl, token, pollIntervalMs: 50 });
  }, 60000);
  afterAll(async () => {
    if (child && child.exitCode === null) {
      const stopped = new Promise<void>(r => child.once('exit', () => r()));
      child.kill(); await stopped;
    }
    await pool.end();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('QQ-E2E-01: six roles, atomic plans, pinned owner approval, retry/restart and revoked sources', async () => {
    const owner = { id: randomUUID(), email: `qq-${randomUUID()}@example.test`, name: 'Synthetic owner' };
    const editor: { id: string; email: string; name: string } = { id: randomUUID(), email: `qq-${randomUUID()}@example.test`, name: 'Synthetic editor' };
    const ws = await workspaces.createWorkspace(owner, { name: 'QQ synthetic six-role pilot', slug: `qq-${randomUUID()}` });
    editor.id = (await workspaces.addWorkspaceMember(owner, ws.id, { email: editor.email, full_name: editor.name, role: 'editor' })).user_id;
    await pool.query("UPDATE business_profiles SET target_audiences=$2,products_services=$3 WHERE workspace_id=$1", [ws.id, ['English-speaking newcomers'], ['Local living information MOCK']]);
    const source = await sources.createWorkspaceSource(owner, ws.id, { title: 'Synthetic living areas guide', kind: 'text', category: 'locations', url_or_blob: 'The guide compares living areas for newcomers.', content_hash: 'synthetic-guide' });
    await pool.query("UPDATE sources SET license='Synthetic fixture only',attribution='QQ test',source_url='https://example.org/guide',retrieved_at='2026-10-01T00:00:00Z' WHERE id=$1", [source.id]);
    const approvedSource = await sources.reviewWorkspaceSource(owner, ws.id, source.id, { decision: 'approved', expected_version: 1 });
    await pool.query("INSERT INTO source_chunks(workspace_id,source_id,source_version,chunk_index,text_content,citation_locator) VALUES($1,$2,$3,0,$4,'paragraph:1')", [ws.id, source.id, approvedSource.version, 'The guide compares living areas for newcomers.']);
    const repo = new PgPlanRepository(pool);
    const asset = { asset_id: randomUUID(), workspace_id: ws.id, version: 1, url: 'https://example.org/mock-image.png', content_hash: 'a'.repeat(64), license: 'Synthetic test fixture only', attribution: 'QQ fixture', status: 'approved', synthetic: true };
    const ctx = await repo.issueContext(ws.id, { goal: { workspace_id: ws.id, objective: 'Prepare a newcomer guide and social drafts' }, assets: [asset] });
    const payload = { workspace_id: ws.id, business_profile: ctx.business_profile, snapshot: ctx.snapshot, goal_context: ctx.goal_context };
    const run = async (operation: string, extra: object = {}, jobId = randomUUID()) => ai.run({ operation: 'content', aiOperation: operation,
      workspace_id: ws.id, job_id: jobId, input_version: 1, context_snapshot_id: ctx.context_snapshot_id,
      approved_source_versions: ctx.approved_source_versions, synthetic: true, trace_id: `qq-all:${jobId}`, input: { ...payload, ...extra } });
    const persist = async (out: Awaited<ReturnType<typeof run>>, operation: string) => {
      const ref = out.artifact! as any;
      await pool.query(`INSERT INTO content_artifacts(id,workspace_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
        VALUES($1,$2,1,$3,$4,$5,$6,'ai_result',$5,'ai_run_store',$7,$8)`, [ref.artifact_id, ws.id, ref.content_hash, ctx.context_snapshot_id, ref.role, operation, JSON.stringify({ artifact: ref, result: out.output }), JSON.stringify(out.evidence ?? [])]);
      return { artifact: ref, result: out.output, evidence: out.evidence ?? [] };
    };
    const researchTask = await enqueueAiTask(pool, ws.id, editor.id, { context_snapshot_id: ctx.context_snapshot_id, synthetic: true, input: { operation: 'research.run' } });
    const research = (await new PlanOutboxRunner(pool, ai).runOnce())!;
    expect(research.task_id).toBe(researchTask.task_id);
    expect((research.output as any).status).toBe('ready_for_handoff');
    expect((research.output as any).findings[0].keywords.length).toBeGreaterThan(0);
    const planTaskInput = { task_id: randomUUID(), context_snapshot_id: ctx.context_snapshot_id, synthetic: true, input: { operation: 'strategy.generate', research_artifact_id: research.artifact.artifact_id, cta: 'Request the guide (MOCK)', deadline: new Date(Date.now() + 86400000).toISOString(), score_factors: Object.fromEntries(['demand', 'business_relevance', 'growth_potential', 'content_gap', 'freshness', 'conversion_potential'].map(k => [k, 3])) } };
    expect((await enqueueAiTask(pool, ws.id, editor.id, planTaskInput)).deduplicated).toBe(false);
    expect((await enqueueAiTask(pool, ws.id, editor.id, planTaskInput)).deduplicated).toBe(true);
    await expect(enqueueAiTask(pool, ws.id, editor.id, { ...planTaskInput, synthetic: false })).rejects.toMatchObject({ code: 'TASK_CONFLICT' });
    const plan = (await new PlanOutboxRunner(pool, ai).runOnce())!;
    await expect(submitCampaignPlan({ repo }, ws.id, plan.artifact)).rejects.toMatchObject({ code: 'SYNTHETIC_NOT_ALLOWED' });
    const accepted = await Promise.all([1, 2].map(() => submitCampaignPlan({ repo, allowSynthetic: true }, ws.id, plan.artifact)));
    expect(accepted.filter(a => a.deduplicated)).toHaveLength(1);
    expect((await pool.query('SELECT * FROM workflow_tasks WHERE workspace_id=$1 AND campaign_id=$2', [ws.id, (plan.output as any).plan_id])).rows).toHaveLength(2);
    const rollbackPlan = structuredClone(plan.output) as any;
    rollbackPlan.plan_id = randomUUID(); rollbackPlan.tasks[0].task_id = randomUUID();
    await expect(repo.accept(rollbackPlan, (await repo.loadContext(ws.id))!)).rejects.toMatchObject({ code: '23505' });
    expect((await pool.query('SELECT id FROM campaigns WHERE id=$1', [rollbackPlan.plan_id])).rowCount).toBe(0);
    expect((await pool.query('SELECT id FROM workflow_tasks WHERE id=$1', [rollbackPlan.tasks[0].task_id])).rowCount).toBe(0);
    const runner = new PlanOutboxRunner(pool, ai);
    const seo = await runner.runOnce();
    expect(seo?.status).toBe('awaiting_approval');
    expect((seo?.output as any).seo_checks).toEqual({ title: true, meta: true, headings: true, internal_link: true, citations: true });
    expect(await runner.runOnce()).toBeNull();
    const approval = { workspaceId: ws.id, taskId: seo!.task_id, actorId: owner.id, version: 1, hash: seo!.artifact.content_hash, allowSynthetic: true };
    await expect(approvePlanTask(pool, { ...approval, allowSynthetic: false })).rejects.toMatchObject({ code: 'SYNTHETIC_NOT_ALLOWED' });
    await expect(approvePlanTask(pool, { ...approval, actorId: editor.id })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(approvePlanTask(pool, { ...approval, hash: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'STALE_APPROVAL' });
    const originalPayload = (await pool.query('SELECT payload FROM content_artifacts WHERE id=$1', [seo!.artifact.artifact_id])).rows[0].payload;
    expect(originalPayload.run_metadata.prompt_version).toBe('seo-v1');
    await pool.query("UPDATE content_artifacts SET payload=jsonb_set(payload,'{result,title}','\"tampered\"') WHERE id=$1", [seo!.artifact.artifact_id]);
    await expect(approvePlanTask(pool, approval)).rejects.toMatchObject({ code: 'ARTIFACT_HASH_MISMATCH' });
    await pool.query('UPDATE content_artifacts SET payload=$2 WHERE id=$1', [seo!.artifact.artifact_id, JSON.stringify(originalPayload)]);
    expect((await approvePlanTask(pool, approval)).opened_tasks).toHaveLength(1);
    expect((await approvePlanTask(pool, approval)).opened_tasks).toHaveLength(0);
    const social = await new PlanOutboxRunner(pool, ai).runOnce();
    expect((social?.output as any).parent_content_id).toBe((seo!.output as any).article_id);
    expect((social?.output as any).image_assets).toHaveLength(1);
    const aggregate = (result: object, role: string) => ({ artifact: { artifact_id: randomUUID(), workspace_id: ws.id, version: 1, content_hash: createHash('sha256').update(canonicalJson({ result, evidence: [] })).digest('hex'), context_snapshot_id: ctx.context_snapshot_id, role, storage: 'ai_run_store' }, result, evidence: [] });
    const metric = aggregate({ workspace_id: ws.id, snapshot_id: randomUUID(), version: 1, window_start: '2026-10-01T00:00:00Z', window_end: '2026-10-07T00:00:00Z', qualified_visits: 12, leads: 2, impressions: 100, clicks: 20, synthetic: true }, 'performance');
    const performance = await run('analytics.report', { metrics: metric });
    const perfInput = await persist(performance, 'analytics.report');
    const community = await run('community.response', { question: 'Can you explain living areas for newcomers?' });
    await persist(community, 'community.response');
    expect((community.output as any).citations.length).toBeGreaterThan(0);
    const learningInput = { performance: perfInput, lead_summary: aggregate({ workspace_id: ws.id, version: 1, count: 2, synthetic: true }, 'growth_lead') };
    await persist({ artifact: learningInput.lead_summary.artifact, output: learningInput.lead_summary.result, evidence: [] } as any, 'lead.aggregate');
    const learningJob = randomUUID();
    const learning = await run('learning.analyze', learningInput, learningJob);
    await persist(learning, 'learning.analyze');
    expect((learning.output as any).next_tasks).toHaveLength(1);
    expect((await run('learning.analyze', learningInput, learningJob)).artifact).toEqual(learning.artifact);
    await expect(acceptLearningTasks(pool, ws.id, editor.id, learning.artifact, true)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    const next = await acceptLearningTasks(pool, ws.id, owner.id, learning.artifact, true);
    expect(next.task_ids).toHaveLength(1);
    expect((await acceptLearningTasks(pool, ws.id, owner.id, learning.artifact, true)).task_ids).toEqual(next.task_ids);
    expect((await new PlanOutboxRunner(pool, ai).runOnce())?.task_id).toBe(next.task_ids[0]);
    const key = (learning.output as any).next_tasks[0].dedup_key;
    expect((await run('learning.analyze', { ...learningInput, prior_dedup_keys: [key] })).output.next_tasks).toEqual([]);
    await sources.reviewWorkspaceSource(owner, ws.id, source.id, { decision: 'revoked', expected_version: approvedSource.version });
    await expect(approvePlanTask(pool, approval)).rejects.toMatchObject({ code: 'SOURCE_NOT_APPROVED' });
    // Lease recovery reuses the persisted AI job; revocation is checked before any call.
    await pool.query("UPDATE plan_task_outbox SET status='claimed',attempts=1,lease_until=now()-interval '1 second' WHERE task_id=$1", [social!.task_id]);
    await expect(new PlanOutboxRunner(pool, ai).runOnce()).rejects.toThrow('SOURCE_NOT_APPROVED');
    const outbox = (await pool.query('SELECT task_id,status,attempts,error_code FROM plan_task_outbox WHERE workspace_id=$1 ORDER BY created_at', [ws.id])).rows;
    expect(outbox.some(o => o.error_code === 'SOURCE_NOT_APPROVED' && o.status === 'failed')).toBe(true);
    const artifacts = (await pool.query('SELECT id,role,operation,content_hash,context_snapshot_id,payload,evidence FROM content_artifacts WHERE workspace_id=$1', [ws.id])).rows;
    expect(new Set(artifacts.map(a => a.role)).size).toBe(6);
    const evidence = resolve(`../evidence/qq-all-2026-10-17`);
    await mkdir(evidence, { recursive: true });
    const audits = (await pool.query('SELECT target_id,target_version,target_hash,status,decision,actor_role FROM approvals WHERE workspace_id=$1', [ws.id])).rows;
    await writeFile(join(evidence, `${mode}-db-pipeline.json`), JSON.stringify({ mode, synthetic: true, database: 'disposable PostgreSQL', transport: 'real HTTP', workspace_id: ws.id, context_snapshot_id: ctx.context_snapshot_id, checks: ['six dedicated roles', 'synthetic production gate', 'concurrent plan/task dedup', 'transaction rollback', 'SEO-before-social owner approval', 'stale/tampered approval rejected', 'worker restart', 'learning persisted next task/replay/dedup', 'source revoke/lease recovery'], artifacts, outbox, audits, model: research.model, passed: true }, null, 2));
  }, 600000);
});
