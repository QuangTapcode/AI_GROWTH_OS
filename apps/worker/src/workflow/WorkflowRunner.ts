import { randomUUID } from 'node:crypto';
import type { JobOperator } from '../jobs/JobState';
import type { WorkflowStore } from './WorkflowStore';
import {
  createWorkflowTask,
  type Workflow,
  type WorkflowEvent,
  type WorkflowEventApplyResult,
  type WorkflowTask,
} from './types';

/**
 * MY-03 — điều phối workflow DAG (dependency dispatch + human wait + resume).
 *
 * - Task pending → dispatch khi đủ deps completed; chạy qua hàm `execute`
 *   inject (thường là submitJob + queue thật); runner KHÔNG tự gọi LLM.
 * - `requires_approval`: task hoàn thành bước chạy → awaiting_approval (human
 *   wait, không giữ lease); resume bằng `applyEvent(approval_granted)`.
 * - Event dedup theo dedup_key: side effect chỉ apply đúng một lần.
 * - Lỗi một task → retry riêng trong max_attempts; quá → failed, downstream
 *   bị blocked (không chạy lại cả campaign).
 * - Restart: state nằm trong WorkflowStore (FileWorkflowStore); `resume()` chỉ
 *   dispatch lại task pending/queued hợp lệ.
 */
export interface WorkflowTaskRunResult {
  output_artifact_ref: string;
}

export type WorkflowTaskExecutor = (task: WorkflowTask) => Promise<WorkflowTaskRunResult>;

export interface WorkflowRunnerOptions {
  store: WorkflowStore;
  execute: WorkflowTaskExecutor;
  now?: () => Date;
}

export interface DispatchOutcome {
  workflow_id: string;
  /** Task vừa chuyển sang awaiting_approval */
  waiting: string[];
  /** Task dispatch chạy xong (completed) */
  completed: string[];
  /** Task chạy lỗi đang retry */
  retrying: string[];
  /** Task failed quá max_attempts */
  failed: string[];
  /** Workflow vừa completed toàn bộ */
  workflow_completed: boolean;
}

export class WorkflowRunner {
  private readonly store: WorkflowStore;
  private readonly execute: WorkflowTaskExecutor;
  private readonly now: () => Date;

  constructor(opts: WorkflowRunnerOptions) {
    this.store = opts.store;
    this.execute = opts.execute;
    this.now = opts.now ?? (() => new Date());
  }

  /** Tạo workflow + tasks (tất cả pending) sau khi validate DAG không có cycle/unknown dep. */
  async createWorkflow(input: {
    id?: string;
    workspace_id: string;
    tasks: Array<{
      id: string;
      operation: JobOperator;
      depends_on?: string[];
      requires_approval?: boolean;
      input_refs?: Record<string, unknown>;
    }>;
  }): Promise<Workflow> {
    const ids = new Set(input.tasks.map((t) => t.id));
    if (ids.size !== input.tasks.length) throw new Error('DUPLICATE_TASK_ID');
    for (const task of input.tasks) {
      for (const dep of task.depends_on ?? []) {
        if (!ids.has(dep)) throw new Error(`UNKNOWN_DEPENDENCY_${dep}`);
      }
    }
    assertNoCycle(input.tasks.map((t) => ({ id: t.id, deps: t.depends_on ?? [] })));

    const now = this.now();
    const workflow: Workflow = {
      id: input.id ?? randomUUID(),
      workspace_id: input.workspace_id,
      state: 'running',
      created_at: now,
      updated_at: now,
    };
    await this.store.insertWorkflow(workflow);
    for (const spec of input.tasks) {
      const task = createWorkflowTask({
        id: spec.id,
        workflow_id: workflow.id,
        operation: spec.operation,
        depends_on: spec.depends_on,
        requires_approval: spec.requires_approval,
        input_refs: spec.input_refs,
        now,
      });
      await this.store.insertTask(task);
    }
    return workflow;
  }

  /**
   * Dispatch các task đủ điều kiện và chạy tới điểm chờ gần nhất.
   * Idempotent: chỉ đụng task pending (dispatch) hoặc queued (chạy lại sau retry).
   */
  async dispatch(workflowId: string): Promise<DispatchOutcome> {
    const workflow = await this.store.getWorkflow(workflowId);
    if (!workflow) throw new Error('WORKFLOW_NOT_FOUND');
    const outcome: DispatchOutcome = {
      workflow_id: workflowId,
      waiting: [],
      completed: [],
      retrying: [],
      failed: [],
      workflow_completed: false,
    };
    if (workflow.state === 'cancelled' || workflow.state === 'failed') return outcome;

    // Lặp tới khi không còn task nào chuyển trạng thái (xử lý chuỗi deps đệ quy).
    // Mỗi dispatch() chỉ chạy mỗi task tối đa một lần: task vừa retry
    // (vẫn 'queued') phải chờ lần dispatch() sau cho attempt kế tiếp —
    // đúng AC: mỗi attempt lỗi là một lần dispatch riêng.
    const attemptedInThisDispatch = new Set<string>();
    for (;;) {
      const tasks = await this.store.listTasks(workflowId);
      const byId = new Map(tasks.map((t) => [t.id, t]));
      const progressed = await this.dispatchOnce(tasks, byId, outcome, attemptedInThisDispatch);
      if (!progressed) break;
    }

    const finalTasks = await this.store.listTasks(workflowId);
    outcome.workflow_completed = finalTasks.every((t) => t.state === 'completed');
    if (outcome.workflow_completed) {
      await this.store.updateWorkflow(workflowId, { state: 'completed', updated_at: this.now() });
    } else if (finalTasks.some((t) => t.state === 'awaiting_approval')) {
      await this.store.updateWorkflow(workflowId, { state: 'awaiting_approval', updated_at: this.now() });
    } else if (finalTasks.some((t) => t.state === 'blocked')) {
      await this.store.updateWorkflow(workflowId, { state: 'blocked', updated_at: this.now() });
    }
    return outcome;
  }

  private async dispatchOnce(
    tasks: WorkflowTask[],
    byId: Map<string, WorkflowTask>,
    outcome: DispatchOutcome,
    attemptedInThisDispatch: Set<string>,
  ): Promise<boolean> {
    let progressed = false;
    for (const task of tasks) {
      if (task.state === 'pending') {
        const deps = task.depends_on.map((id) => byId.get(id));
        if (deps.some((d) => !d)) {
          await this.store.updateTask(task.id, {
            state: 'blocked',
            error_code: 'MISSING_DEPENDENCY',
            error_message: 'một dependency không tồn tại',
            updated_at: this.now(),
          });
          progressed = true;
          continue;
        }
        if (deps.some((d) => d!.state === 'failed' || d!.state === 'blocked' || d!.state === 'cancelled')) {
          await this.store.updateTask(task.id, {
            state: 'blocked',
            error_code: 'DEPENDENCY_FAILED',
            error_message: 'dependency upstream failed/blocked',
            updated_at: this.now(),
          });
          progressed = true;
          continue;
        }
        if (deps.every((d) => d!.state === 'completed')) {
          await this.store.updateTask(task.id, { state: 'queued', updated_at: this.now() });
          progressed = true;
        }
        continue;
      }
      if (task.state === 'queued') {
        if (attemptedInThisDispatch.has(task.id)) continue; // attempt kế tiếp chờ lần dispatch sau
        attemptedInThisDispatch.add(task.id);
        progressed = true;
        await this.runTask(task, outcome);
      }
    }
    return progressed;
  }

  private async runTask(task: WorkflowTask, outcome: DispatchOutcome): Promise<void> {
    await this.store.updateTask(task.id, {
      state: 'running',
      attempt: task.attempt + 1,
      updated_at: this.now(),
    });
    try {
      const result = await this.execute(task);
      if (task.requires_approval) {
        // Human wait: không giữ lease/LLM; resume bằng approval event.
        await this.store.updateTask(task.id, {
          state: 'awaiting_approval',
          output_artifact_ref: result.output_artifact_ref,
          error_code: null,
          error_message: null,
          updated_at: this.now(),
        });
        outcome.waiting.push(task.id);
      } else {
        await this.store.updateTask(task.id, {
          state: 'completed',
          output_artifact_ref: result.output_artifact_ref,
          error_code: null,
          error_message: null,
          updated_at: this.now(),
        });
        outcome.completed.push(task.id);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const code = (err as { code?: string }).code ?? 'TASK_EXECUTION_FAILED';
      const exhausted = task.attempt + 1 >= task.max_attempts;
      await this.store.updateTask(task.id, {
        state: exhausted ? 'failed' : 'queued',
        error_code: code,
        error_message: error.message.slice(0, 500),
        updated_at: this.now(),
      });
      (exhausted ? outcome.failed : outcome.retrying).push(task.id);
    }
  }

  /**
   * Apply event side effect đúng một lần (dedup theo dedup_key).
   * approval_granted → completed; approval_rejected → queued để rework
   * (attempt không tăng — rejection là phản hồi, không phải retry lỗi).
   */
  async applyEvent(input: {
    workflow_id: string;
    task_id: string | null;
    type: WorkflowEvent['type'];
    dedup_key: string;
    payload?: Record<string, unknown>;
  }): Promise<WorkflowEventApplyResult> {
    const workflow = await this.store.getWorkflow(input.workflow_id);
    if (!workflow) return { applied: false, reason: 'WORKFLOW_NOT_FOUND' };
    if (input.task_id) {
      const task = await this.store.getTask(input.task_id);
      if (!task || task.workflow_id !== input.workflow_id) {
        return { applied: false, reason: 'UNKNOWN_TASK' };
      }
    }

    const event: WorkflowEvent = {
      id: randomUUID(),
      workflow_id: input.workflow_id,
      task_id: input.task_id,
      type: input.type,
      dedup_key: input.dedup_key,
      payload: input.payload ?? {},
      created_at: this.now(),
    };
    const result = await this.store.appendEvent(event);
    if (!result.applied) return result;

    if (input.task_id) {
      const task = await this.store.getTask(input.task_id);
      if (task) {
        if (input.type === 'approval_granted' && task.state === 'awaiting_approval') {
          await this.store.updateTask(task.id, {
            state: 'completed',
            error_code: null,
            error_message: null,
            updated_at: this.now(),
          });
        } else if (input.type === 'approval_rejected' && task.state === 'awaiting_approval') {
          await this.store.updateTask(task.id, {
            state: 'queued',
            error_code: 'APPROVAL_REJECTED',
            error_message: 'người duyệt yêu cầu sửa lại',
            updated_at: this.now(),
          });
        } else if (input.type === 'cancelled') {
          await this.store.updateTask(task.id, { state: 'cancelled', updated_at: this.now() });
        }
      }
    }
    if (input.type === 'cancelled') {
      await this.store.updateWorkflow(input.workflow_id, { state: 'cancelled', updated_at: this.now() });
    }
    return result;
  }

  /** Sau restart: đưa task running dở dang về queued rồi dispatch tiếp (chỉ step cần chạy). */
  async resume(workflowId: string): Promise<DispatchOutcome> {
    const tasks = await this.store.listTasks(workflowId);
    for (const task of tasks) {
      if (task.state === 'running') {
        await this.store.updateTask(task.id, { state: 'queued', updated_at: this.now() });
      }
    }
    return this.dispatch(workflowId);
  }

  /**
   * Requeue một step failed/blocked sau khi đã fix (MY-03: retry step lỗi,
   * không chạy lại toàn campaign). Reset attempt, hạ downstream bị
   * DEPENDENCY_FAILED về pending; các task đã completed giữ nguyên.
   */
  async requeueFailed(workflowId: string, taskId: string): Promise<void> {
    const task = await this.store.getTask(taskId);
    if (!task || task.workflow_id !== workflowId) throw new Error('TASK_NOT_FOUND');
    if (task.state !== 'failed' && task.state !== 'blocked') {
      throw new Error(`TASK_NOT_REQUEUABLE_${task.state}`);
    }
    await this.store.updateTask(taskId, {
      state: 'pending',
      attempt: 0,
      error_code: null,
      error_message: null,
      updated_at: this.now(),
    });
    // Hạ downstream blocked vì dependency failed về pending để dispatch lại.
    const siblings = await this.store.listTasks(workflowId);
    for (const sibling of siblings) {
      if (sibling.state === 'blocked' && sibling.error_code === 'DEPENDENCY_FAILED') {
        await this.store.updateTask(sibling.id, {
          state: 'pending',
          error_code: null,
          error_message: null,
          updated_at: this.now(),
        });
      }
    }
    await this.store.updateWorkflow(workflowId, { state: 'running', updated_at: this.now() });
  }
}

/** DFS kiểm tra cycle trong DAG dependencies. */
function assertNoCycle(nodes: Array<{ id: string; deps: string[] }>): void {
  const graph = new Map(nodes.map((n) => [n.id, n.deps]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error(`DEPENDENCY_CYCLE_AT_${id}`);
    visiting.add(id);
    for (const dep of graph.get(id) ?? []) visit(dep);
    visiting.delete(id);
    done.add(id);
  };
  for (const node of nodes) visit(node.id);
}