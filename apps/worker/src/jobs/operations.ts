import type { JobOperator } from './JobState';
import type { OperationHandler } from './JobRunner';

/**
 * Registry operation → handler (W1-MY-01).
 * Mặc định mọi operation chạy qua FakeAiAdapter (AI_PROVIDER_MODE=fake):
 * output xác định, kiểm thử nội bộ không cần service Python thật.
 */
export type OperationHandlers = Record<JobOperator, OperationHandler>;

const OPERATIONS: JobOperator[] = [
  'ingest',
  'ingest_revoke',
  'ingest_delete',
  'research',
  'score',
  'strategy',
  'content',
  'publish',
  'metrics',
  'lead',
  'integrations',
];

export function buildOperationHandlers(): OperationHandlers {
  const generic: OperationHandler = async (ctx) => {
    await ctx.progress(10);
    const res = await ctx.ai.run({
      operation: ctx.job.operation,
      input: ctx.job.payload,
      // idempotency: cùng job attempt không gọi provider tính trùng khi retry
      idempotency_key: `${ctx.job.id}:${ctx.job.attempt}`,
    });
    await ctx.progress(90);
    return { synthetic: true, ...res.output, model: res.model, schema_version: res.schema_version };
  };
  const handlers = {} as OperationHandlers;
  for (const op of OPERATIONS) handlers[op] = generic;
  return handlers;
}