import type { JobOperator } from './JobState';
import type { OperationHandler } from './JobRunner';
import { PermanentJobError } from './JobRunner';
import type { AiRunRequest } from '../adapters/AiAdapter';

/**
 * Registry operation → handler (W1-MY-01, bổ sung typed routing MY-01).
 *
 * - Operation AI-backed được map sang mã operation phía AI service (CR-001);
 *   HttpAiAdapter dùng `aiOperation` khi dựng JobRequest.
 * - publish/lead/metrics/integrations/ingest_revoke/ingest_delete KHÔNG đi qua
 *   LLM generic — chúng do executor/integration (MY-04–06) và BE xử lý. Chưa
 *   wiring thì fail rõ `OPERATION_NOT_WIRED`, không fake kết quả.
 */
export type OperationHandlers = Record<JobOperator, OperationHandler>;

/** Worker operation → AI operation theo registry sáu role (CR-002). */
export const WORKER_TO_AI_OPERATION: Partial<Record<JobOperator, string>> = {
  ingest: 'knowledge.ingest',
  research: 'research.run',
  score: 'opportunity.score',
  strategy: 'strategy.generate',
  content: 'content.generate',
};

/**
 * Operation không gọi LLM. Owner/task wiring:
 * ingest_revoke/ingest_delete → snapshot scoping phía BE (TQ-02);
 * publish → CMS executor (MY-04/05); metrics → ingestion (MY-06);
 * lead → community intake (MY-06); integrations → connector (MY-02/06).
 */
export const NON_AI_OPERATIONS: readonly JobOperator[] = [
  'ingest_revoke',
  'ingest_delete',
  'publish',
  'metrics',
  'lead',
  'integrations',
];

const WIRE_HINTS: Record<string, string> = {
  ingest_revoke: 'snapshot scoping phía BE (TQ-02)',
  ingest_delete: 'snapshot scoping phía BE (TQ-02)',
  publish: 'CMS executor (MY-04/MY-05)',
  metrics: 'metrics ingestion GA4/GSC/Meta (MY-06)',
  lead: 'community intake/persistence (MY-06)',
  integrations: 'connector adapter (MY-02/MY-06)',
};

/** Handler AI-backed: gửi đúng context JobRequest (idempotency = job_id+operation+input_version). */
function aiBackedHandler(aiOperation: string): OperationHandler {
  return async (ctx) => {
    await ctx.progress(10);
    // Envelope pins belong to JobRequest, not the strict operation payload.
    const { context_snapshot_id, approved_source_versions, prompt_version, model_version,
      synthetic, ...input } = ctx.job.payload as Record<string, unknown> & Pick<AiRunRequest,
        'context_snapshot_id' | 'approved_source_versions' | 'prompt_version' | 'model_version' | 'synthetic'>;
    const res = await ctx.ai.run({
      operation: ctx.job.operation,
      aiOperation,
      input,
      job_id: ctx.job.id,
      workspace_id: ctx.job.workspace_id,
      input_version: ctx.job.input_version,
      trace_id: ctx.job.trace_id,
      context_snapshot_id: context_snapshot_id ?? null,
      approved_source_versions: approved_source_versions ?? [],
      prompt_version,
      model_version,
      synthetic,
      // Khóa theo contract CR-001; resend cùng attempt không tạo run mới.
      idempotency_key: `${ctx.job.id}:${aiOperation}:${ctx.job.input_version}`,
    });
    await ctx.progress(90);
    return {
      ...res.output,
      model: res.model,
      schema_version: res.schema_version,
      ...(res.run_id ? { ai_run_id: res.run_id } : {}),
      ...(res.artifact ? { artifact: res.artifact } : {}),
      ...(res.evidence ? { evidence: res.evidence } : {}),
    };
  };
}

export function buildOperationHandlers(): OperationHandlers {
  const handlers = {} as OperationHandlers;
  for (const [operation, aiOperation] of Object.entries(WORKER_TO_AI_OPERATION)) {
    handlers[operation as JobOperator] = aiBackedHandler(aiOperation!);
  }
  for (const operation of NON_AI_OPERATIONS) {
    handlers[operation] = async () => {
      throw new PermanentJobError(
        `operation ${operation} không đi qua LLM generic; chưa được wiring (${WIRE_HINTS[operation]})`,
        'OPERATION_NOT_WIRED',
      );
    };
  }
  return handlers;
}
