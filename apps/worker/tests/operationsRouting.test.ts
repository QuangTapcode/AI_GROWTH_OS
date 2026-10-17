import { describe, it, expect } from 'vitest';
import {
  buildOperationHandlers,
  WORKER_TO_AI_OPERATION,
  NON_AI_OPERATIONS,
} from '../src/jobs/operations';
import { createJobState, type JobState, type JobOperator } from '../src/jobs/JobState';
import { PermanentJobError, type JobContext } from '../src/jobs/JobRunner';
import type { AiRunRequest, AiRunResult } from '../src/adapters/AiAdapter';

const WS_ID = '22222222-2222-4222-8222-222222222222';

function makeCtx(
  job: JobState,
  ai: { run: (req: AiRunRequest) => Promise<AiRunResult> },
): JobContext {
  return { job, now: () => new Date(), progress: async () => {}, ai };
}

describe('Typed job routing (MY-01)', () => {
  it('map worker operation → AI operation theo CR-001/CR-002 (MY-04/05/06 đã wiring)', () => {
    expect(WORKER_TO_AI_OPERATION).toMatchObject({
      ingest: 'knowledge.ingest',
      research: 'research.run',
      score: 'opportunity.score',
      strategy: 'strategy.generate',
      content: 'content.generate',
    });
    for (const op of ['ingest_revoke', 'ingest_delete'] as const) {
      expect(WORKER_TO_AI_OPERATION[op]).toBeUndefined();
      expect(NON_AI_OPERATIONS).toContain(op);
    }
    // publish/lead/metrics/integrations đã wiring executor, không còn trong NON_AI list
    for (const op of ['publish', 'lead', 'metrics', 'integrations'] as const) {
      expect(WORKER_TO_AI_OPERATION[op]).toBeUndefined();
      expect(NON_AI_OPERATIONS).not.toContain(op);
    }
  });

  it('research handler gửi đủ JobRequest context + idempotency theo contract', async () => {
    const handlers = buildOperationHandlers();
    const job = createJobState({
      workspace_id: WS_ID,
      organization_id: 'org-1',
      operation: 'research',
      payload: {
        question: 'expat housing',
        context_snapshot_id: '55555555-5555-4555-8555-555555555555',
        approved_source_versions: [{ source_id: '66666666-6666-4666-8666-666666666666', version: 2 }],
      },
      input_version: 4,
    });
    const calls: AiRunRequest[] = [];
    const ai = {
      run: async (req: AiRunRequest): Promise<AiRunResult> => {
        calls.push(req);
        return {
          output: { brief_id: 'B-9' },
          model: 'qwen3:4b-instruct',
          schema_version: '1.0.0',
          run_id: '77777777-7777-4777-8777-777777777777',
          artifact: { artifact_id: '88888888-8888-4888-8888-888888888888', version: 4 },
          evidence: [{ quote: 'nguyên văn' }],
        };
      },
    };
    const result = await handlers.research(makeCtx(job, ai));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      operation: 'research',
      aiOperation: 'research.run',
      job_id: job.id,
      workspace_id: WS_ID,
      input_version: 4,
      trace_id: job.trace_id,
      context_snapshot_id: '55555555-5555-4555-8555-555555555555',
      idempotency_key: `${job.id}:research.run:4`,
    });
    // Persist run/artifact refs cùng job result (MY-01 AC).
    expect(result).toMatchObject({
      brief_id: 'B-9',
      ai_run_id: '77777777-7777-4777-8777-777777777777',
      artifact: { artifact_id: '88888888-8888-4888-8888-888888888888', version: 4 },
    });
  });

  it('ingest_revoke/ingest_delete KHÔNG gọi LLM — fail OPERATION_NOT_WIRED; publish/lead/metrics đã wiring executor (MY-04/05/06)', async () => {
    const handlers = buildOperationHandlers();
    for (const operation of ['ingest_revoke', 'ingest_delete'] as JobOperator[]) {
      const job = createJobState({ workspace_id: WS_ID, organization_id: 'org-1', operation });
      let aiCalls = 0;
      const ai = {
        run: async (): Promise<AiRunResult> => {
          aiCalls += 1;
          return { output: {}, model: '', schema_version: '' };
        },
      };
      const err = await handlers[operation](makeCtx(job, ai)).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PermanentJobError);
      expect(err).toMatchObject({ code: 'OPERATION_NOT_WIRED' });
      expect(aiCalls).toBe(0);
    }
    // publish/lead/metrics/integrations chạy executor thật, không gọi AI
    const publishJob = createJobState({
      workspace_id: WS_ID,
      organization_id: 'org-1',
      operation: 'publish',
      payload: { contentId: 'c1', channel: 'Website', bodyMarkdown: '# hi', contentHash: 'h', expectedVersion: 1 },
    });
    const noAi = { run: async (): Promise<AiRunResult> => { throw new Error('AI must not be called'); } };
    const pubRes = (await handlers.publish(makeCtx(publishJob, noAi))) as Record<string, unknown>;
    expect(pubRes['channel']).toBe('Website');

    const leadJob = createJobState({
      workspace_id: WS_ID,
      organization_id: 'org-1',
      operation: 'lead',
      payload: { contactEmail: 'a@b.com', utmSource: 'fb', utmMedium: 'social', utmCampaign: 'c', consent: true },
    });
    // Khi dev set DATABASE_URL, lead handler dùng PG thật (autoPgStore) —
    // seed workspace WS_ID tạm để FK không fail (cleanup sau test).
    const url = process.env['DATABASE_URL'];
    let seededPool: { query: (q: string, p?: unknown[]) => Promise<unknown>; end: () => Promise<void> } | null = null;
    if (url) {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 4000 });
      try {
        await pool.query('SELECT 1');
        await pool.query(
          `INSERT INTO workspaces (id, name, slug) VALUES ($1, 'routing-test', $2)
           ON CONFLICT (id) DO NOTHING`,
          [WS_ID, `routing-test-${WS_ID}`],
        );
        seededPool = pool;
      } catch {
        await pool.end().catch(() => {});
      }
    }
    try {
      const leadRes = (await handlers.lead(makeCtx(leadJob, noAi))) as { duplicate: boolean };
      expect(leadRes.duplicate).toBe(false);
    } finally {
      if (seededPool) {
        await seededPool.query('DELETE FROM workspaces WHERE id = $1', [WS_ID]);
        await seededPool.end();
      }
    }

    const metricsJob = createJobState({ workspace_id: WS_ID, organization_id: 'org-1', operation: 'metrics' });
    const metRes = (await handlers.metrics(makeCtx(metricsJob, noAi))) as { allMissing: boolean };
    expect(metRes.allMissing).toBe(true);
  });

  it('PermanentJobError code tùy biến được ghi vào outcome', () => {
    expect(new PermanentJobError('x', 'OPERATION_NOT_WIRED').code).toBe('OPERATION_NOT_WIRED');
    expect(new PermanentJobError('x').code).toBe('PERMANENT_FAILURE');
  });
});