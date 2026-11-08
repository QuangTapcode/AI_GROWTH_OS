import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { expect, it, vi } from 'vitest';
import type { AiAdapter } from '../src/adapters/AiAdapter';
import { PlanOutboxRunner, packEmbedding } from '../src/workflow/PlanOutboxRunner';

const ws = randomUUID(), ctx = randomUUID(), taskId = randomUUID(), sourceId = randomUUID();

/** Stops at the AI call: what the question is sent with is all this test looks at. */
async function dispatched(chunkIds: string[], stored: { id: string; model: string; embedding: string }[]) {
  const snapshot = { workspace_id: ws, snapshot_id: ctx, sources: [{ source_id: sourceId, version: 1,
    chunks: chunkIds.map((id) => ({ chunk_id: id, text: 'Da Nang guide', locator: null })) }] };
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("SET status='claimed'") && sql.includes('RETURNING *')) return { rows: [{ id: randomUUID(), workspace_id: ws, task_id: taskId, attempts: 1, operation: 'community.response' }] };
    if (sql.includes('SELECT * FROM workflow_tasks')) return { rows: [{ id: taskId, role: 'community', operation: 'community.response', status: 'queued', input_version: 1, context_snapshot_id: ctx, payload: { input: { question: 'Which area?' } }, created_at: new Date() }] };
    if (sql.includes('SELECT * FROM knowledge_contexts')) return { rows: [{ snapshot_id: ctx, profile_version: 1, profile: { version: 1 }, snapshot, goal: null }] };
    if (sql.includes('SELECT version FROM business_profiles')) return { rows: [{ version: 1 }] };
    if (sql.includes('SELECT id FROM sources')) return { rows: [{ id: sourceId }] };
    if (sql.includes('FROM source_chunks')) return { rows: stored };
    return { rows: [], rowCount: 1 };
  });
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  const run = vi.fn().mockRejectedValue(new Error('stop after building the input'));
  await new PlanOutboxRunner(pool, { run } as unknown as AiAdapter).runOnce().catch(() => undefined);
  return { input: run.mock.calls[0][0].input, snapshot, query };
}

it('sends a customer question with the vectors stored at ingest, so the corpus is not embedded again', async () => {
  const { input, query } = await dispatched(['c1', 'c2'], [{ id: 'c1', model: 'ollama/embeddinggemma:latest', embedding: '[0.123456,-0.5]' }]);
  const [first, second] = input.snapshot.sources[0].chunks;
  // Packed as float16 (AI decodes "f16:"), so a large corpus fits the request limit.
  expect(first).toMatchObject({ chunk_id: 'c1', model: 'ollama/embeddinggemma:latest', embedding: packEmbedding([0.123456, -0.5]) });
  expect(second.embedding).toBeUndefined();
  const [sql, params] = query.mock.calls.find(([text]) => String(text).includes('FROM source_chunks')) as unknown as [string, unknown[]];
  expect(sql).toContain('workspace_id=$1');
  expect(params[0]).toBe(ws);
});

it('keeps the pinned context free of vectors', async () => {
  const { snapshot } = await dispatched(['c1'], [{ id: 'c1', model: 'm', embedding: '[0.1]' }]);
  expect(snapshot.sources[0].chunks[0]).not.toHaveProperty('embedding');
});

it('sends vectors for a corpus of 1,300 chunks, the size TripC reached on 08/11', async () => {
  const ids = Array.from({ length: 1301 }, (_, i) => `c${i}`);
  const { input } = await dispatched(ids, [{ id: 'c1300', model: 'm', embedding: '[0.25]' }]);
  expect(input.snapshot.sources[0].chunks[1300].embedding).toBe(packEmbedding([0.25]));
});

it('sends no vectors for a corpus that would exceed the AI request limit', async () => {
  const ids = Array.from({ length: 3001 }, (_, i) => `c${i}`);
  const { input, query } = await dispatched(ids, []);
  expect(input.snapshot.sources[0].chunks[0].embedding).toBeUndefined();
  expect(query.mock.calls.some(([text]) => String(text).includes('FROM source_chunks'))).toBe(false);
});
