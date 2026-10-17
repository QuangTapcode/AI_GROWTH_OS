/** Real worker -> Python HTTP -> QQ-04 backend mock contract check after merge. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpAiAdapter } from '../../../apps/worker/src/adapters/HttpAiAdapter';
import { buildOperationHandlers } from '../../../apps/worker/src/jobs/operations';
import { createJobState } from '../../../apps/worker/src/jobs/JobState';
import { MockPlanRepository } from '../../../apps/api/src/modules/campaignPlans/mockRepository';
import { createCampaignPlanRoutes } from '../../../apps/api/src/modules/campaignPlans/routes';
import type { ArtifactRef, CampaignPlan } from '../../../apps/api/src/modules/campaignPlans/schemas';

async function main() {
  const repoRoot = process.cwd();
  const python = process.env.QQ_PYTHON;
  if (!python) throw new Error('Set QQ_PYTHON to a Python interpreter with the AI dependencies installed');
  const fixture = JSON.parse(await readFile(path.join(repoRoot, 'qa/evidence/qq04/mock-report.json'), 'utf8'));
  const directory = await mkdtemp(path.join(tmpdir(), 'mybe-ai-http-'));
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>(resolve => socket.close(() => resolve()));
  const token = randomUUID();
  const child = spawn(python, ['-m', 'uvicorn', 'src.app.main:app', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: path.join(repoRoot, 'services/ai'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LLM_PROVIDER_MODE: 'fake', AI_RUN_STORE_PATH: path.join(directory, 'runs.sqlite3'),
      INTERNAL_AI_AUTH_TOKEN: token, PYTHONIOENCODING: 'utf-8' },
  });
  let log = '';
  child.stdout.on('data', data => { log += String(data); });
  child.stderr.on('data', data => { log += String(data); });
  let spawnError: Error | undefined;
  child.on('error', error => { spawnError = error; });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`AI exited early: ${log}`);
      try { ready = (await fetch(`${baseUrl}/healthz`)).ok; } catch { /* startup */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ready, `AI startup timed out: ${log}`);
    const ai = new HttpAiAdapter({ baseUrl, token, pollIntervalMs: 10, pollTimeoutMs: 10_000 });
    const handlers = buildOperationHandlers();
    const researchRequest = fixture.research_request;
    const workspace = researchRequest.workspace_id;
    function context(operation: 'research' | 'strategy', input: Record<string, unknown>, prompt: string) {
      const job = createJobState({ workspace_id: workspace, organization_id: randomUUID(), operation,
        payload: { ...input, context_snapshot_id: researchRequest.context_snapshot_id,
          approved_source_versions: researchRequest.approved_source_versions, synthetic: true, prompt_version: prompt },
        input_version: 1 });
      return { job, ai, now: () => new Date(), progress: async () => {} };
    }
    const research = await handlers.research(context('research', researchRequest.payload, 'research-v2')) as Record<string, unknown>;
    assert.equal(research.status, 'ready_for_handoff');
    const planContext = context('strategy', {
      ...fixture.plan_request.payload,
      deadline: '2026-11-04T10:00:00Z',
      research: Object.fromEntries(Object.entries(research).filter(([key]) =>
        !['model', 'schema_version', 'ai_run_id', 'artifact', 'evidence'].includes(key))),
      research_artifact: research.artifact,
    }, 'growth-lead-v1');
    const output = await handlers.strategy(planContext) as Record<string, unknown>;
    const { model, schema_version, ai_run_id, artifact, evidence, ...rawPlan } = output;
    const plan = rawPlan as CampaignPlan;
    assert.equal(plan.status, 'proposed');
    assert.equal(plan.synthetic, true);
    assert.deepEqual((await handlers.strategy(planContext)), output);
    const repository = new MockPlanRepository();
    const researchBody = Object.fromEntries(Object.entries(research).filter(([key]) =>
      !['model', 'schema_version', 'ai_run_id', 'artifact', 'evidence'].includes(key)));
    repository.seedArtifact({ ref: research.artifact as ArtifactRef, result: researchBody, evidence: research.evidence as unknown[] });
    repository.seedArtifact({ ref: artifact as ArtifactRef, result: plan, evidence: evidence as unknown[] });
    repository.seedContext(workspace, { snapshot_id: researchRequest.context_snapshot_id,
      profile_version: 1, approved_sources: researchRequest.approved_source_versions });
    const routes = createCampaignPlanRoutes({ repo: repository, allowSynthetic: true });
    const accepted = await routes.handleSubmit(workspace, artifact);
    const duplicate = await routes.handleSubmit(workspace, artifact);
    assert.equal(accepted.status, 201);
    assert.equal(duplicate.status, 200);
    assert.equal(repository.records.length, 1);
    assert.deepEqual(repository.records[0].outbox, [{ task_id: plan.tasks[0].task_id, operation: 'seo.local_draft' }]);
    assert.equal(repository.records[0].task_states[plan.tasks[1].task_id], 'blocked');
    const foreign = context('research', researchRequest.payload, 'research-v2');
    foreign.job.workspace_id = randomUUID();
    await assert.rejects(() => handlers.research(foreign), { code: 'TENANT_SCOPE_VIOLATION', permanent: true });
    const destination = path.join(repoRoot, 'qa/evidence/merge-my-be');
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, 'worker-ai-http.json'), JSON.stringify({
      synthetic: true, transport: 'worker HttpAiAdapter -> real Uvicorn HTTP -> backend mock', model,
      storage: 'temporary AI SQLite + in-memory business repository',
      checks: ['research_typed_payload', 'growth_lead_typed_payload', 'prompt_and_synthetic_pins',
        'ai_retry_same_artifact', 'backend_201_then_200', 'seo_only_outbox', 'social_dependency_blocked', 'foreign_tenant_rejected'],
      plan_artifact: artifact, accepted, duplicate,
    }, null, 2) + '\n');
    console.log('PASS: worker -> Python HTTP research/plan -> backend validation/outbox; retry and tenant checks.');
  } finally {
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    // The temporary directory was generated above; no application data is removed.
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
