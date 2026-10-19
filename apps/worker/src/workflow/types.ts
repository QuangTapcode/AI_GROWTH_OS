import type { JobOperator } from '../jobs/JobState';

/**
 * MY-03 — Workflow DAG task (dependency dispatch, human wait, event dedup).
 * Trạng thái theo SIX-AGENT-RESTRUCTURE: pending → queued → running →
 * awaiting_approval/blocked → completed; failed/cancelled là nhánh.
 * Human wait là workflow state — KHÔNG giữ lease/LLM; resume qua approval event.
 */
export type WorkflowTaskState =
  | 'pending'
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkflowState = 'running' | 'awaiting_approval' | 'blocked' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowTask {
  id: string;
  workflow_id: string;
  operation: JobOperator;
  /** ID các task phải completed trước khi task này dispatch */
  depends_on: string[];
  state: WorkflowTaskState;
  attempt: number;
  max_attempts: number;
  /** Input artifact/context refs — không truyền toàn bộ lịch sử chat */
  input_refs: Record<string, unknown>;
  /** Output artifact ref khi completed (CR-002 artifact hoặc publication ref) */
  output_artifact_ref: string | null;
  /** JobState.id đã dispatch cho task này (nullable trước khi chạy) */
  job_id: string | null;
  /** Task cần human approve trước khi completed (approval là gate, không phải run) */
  requires_approval: boolean;
  error_code: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Workflow {
  id: string;
  workspace_id: string;
  state: WorkflowState;
  created_at: Date;
  updated_at: Date;
}

export type WorkflowEventType =
  | 'task_completed'
  | 'task_failed'
  | 'approval_granted'
  | 'approval_rejected'
  | 'cancelled';

export interface WorkflowEvent {
  id: string;
  workflow_id: string;
  task_id: string | null;
  type: WorkflowEventType;
  /** Exactly-once: cùng key chỉ apply một lần (outbox/dedup theo contract §5) */
  dedup_key: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

export type WorkflowEventApplyResult =
  | { applied: true; event: WorkflowEvent }
  | { applied: false; reason: 'DUPLICATE_EVENT' | 'WORKFLOW_NOT_FOUND' | 'UNKNOWN_TASK' | 'INVALID_TRANSITION' };

export function createWorkflowTask(input: {
  id: string;
  workflow_id: string;
  operation: JobOperator;
  depends_on?: string[];
  requires_approval?: boolean;
  input_refs?: Record<string, unknown>;
  max_attempts?: number;
  now?: Date;
}): WorkflowTask {
  const now = input.now ?? new Date();
  return {
    id: input.id,
    workflow_id: input.workflow_id,
    operation: input.operation,
    depends_on: input.depends_on ?? [],
    state: 'pending',
    attempt: 0,
    max_attempts: input.max_attempts ?? 3,
    input_refs: input.input_refs ?? {},
    output_artifact_ref: null,
    job_id: null,
    requires_approval: input.requires_approval ?? false,
    error_code: null,
    error_message: null,
    created_at: now,
    updated_at: now,
  };
}