import { createJobState, type JobOperator, type JobState } from './JobState';
import type { JobStore } from './JobStore';
import type { QueueTransport } from '../adapters/QueueAdapter';
import { QueueJobs } from './QueueConfig';

/**
 * Tạo job (persist vào store) rồi enqueue message `{job_id}` lên queue.
 * API/producer nội bộ gọi hàm này; worker xử lý qua JobRunner.
 */
export interface SubmitJobInput {
  operation: JobOperator;
  workspace_id: string;
  organization_id: string;
  payload?: Record<string, unknown>;
  max_attempts?: number;
  request_id?: string;
  trace_id?: string;
  deadline?: Date;
}

export async function submitJob(
  input: SubmitJobInput,
  deps: { store: JobStore; queue?: QueueTransport; startAfterMs?: number },
): Promise<JobState> {
  const job = createJobState({
    operation: input.operation,
    workspace_id: input.workspace_id,
    organization_id: input.organization_id,
    payload: input.payload,
    max_attempts: input.max_attempts,
    request_id: input.request_id,
    trace_id: input.trace_id,
    deadline: input.deadline,
  });
  await deps.store.insert(job);
  if (deps.queue) {
    await deps.queue.enqueue(queueNameForOperation(job.operation), { job_id: job.id }, {
      startAfterMs: deps.startAfterMs,
    });
  }
  return job;
}

/** Map operation → pg-boss job name (khác format: ingest_revoke → ingest-revoke). */
export function queueNameForOperation(operation: JobOperator): string {
  switch (operation) {
    case 'ingest':
      return QueueJobs.INGEST;
    case 'ingest_revoke':
      return QueueJobs.INGEST_REVOKE;
    case 'ingest_delete':
      return QueueJobs.INGEST_DELETE;
    case 'research':
      return QueueJobs.RESEARCH;
    case 'score':
      return QueueJobs.SCORE;
    case 'strategy':
      return QueueJobs.STRATEGY;
    case 'content':
      return QueueJobs.CONTENT;
    case 'publish':
      return QueueJobs.PUBLISH;
    case 'metrics':
      return QueueJobs.METRICS;
    case 'lead':
      return QueueJobs.LEAD;
    case 'integrations':
      return QueueJobs.INTEGRATIONS;
    default: {
      const exhaustive: never = operation;
      throw new Error(`UNKNOWN_OPERATION_${String(exhaustive)}`);
    }
  }
}