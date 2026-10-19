import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import {
  type Workflow,
  type WorkflowEvent,
  type WorkflowEventApplyResult,
  type WorkflowTask,
} from './types';

/**
 * MY-03 — persistence cho workflow/task/event.
 * Interface tách riêng để MY-03 thay DB store (kysely) khi migration TQ-02
 * sẵn sàng; mọi nơi chỉ phụ thuộc interface này (giống JobStore).
 */
export interface WorkflowStore {
  insertWorkflow(wf: Workflow): Promise<void>;
  getWorkflow(id: string): Promise<Workflow | null>;
  updateWorkflow(id: string, patch: Partial<Workflow>): Promise<Workflow>;

  insertTask(task: WorkflowTask): Promise<void>;
  getTask(id: string): Promise<WorkflowTask | null>;
  listTasks(workflowId: string): Promise<WorkflowTask[]>;
  updateTask(id: string, patch: Partial<WorkflowTask>): Promise<WorkflowTask>;

  /**
   * Ghi event với exactly-once theo dedup_key (scope workflow).
   * Trả DUPLICATE_EVENT nếu key đã ghi — không apply lại side effect.
   */
  appendEvent(event: WorkflowEvent): Promise<WorkflowEventApplyResult>;
  listEvents(workflowId: string): Promise<WorkflowEvent[]>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryWorkflowStore implements WorkflowStore {
  private readonly workflows = new Map<string, Workflow>();
  private readonly tasks = new Map<string, WorkflowTask>();
  /** key = workflow_id + '|' + dedup_key */
  private readonly events = new Map<string, WorkflowEvent>();
  private readonly eventList: WorkflowEvent[] = [];

  async insertWorkflow(wf: Workflow): Promise<void> {
    if (this.workflows.has(wf.id)) throw new Error('WORKFLOW_EXISTS');
    this.workflows.set(wf.id, clone(wf));
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    const wf = this.workflows.get(id);
    return wf ? clone(wf) : null;
  }

  async updateWorkflow(id: string, patch: Partial<Workflow>): Promise<Workflow> {
    const wf = this.workflows.get(id);
    if (!wf) throw new Error('WORKFLOW_NOT_FOUND');
    Object.assign(wf, patch, { updated_at: patch.updated_at ?? new Date() });
    return clone(wf);
  }

  async insertTask(task: WorkflowTask): Promise<void> {
    if (this.tasks.has(task.id)) throw new Error('TASK_EXISTS');
    this.tasks.set(task.id, clone(task));
  }

  async getTask(id: string): Promise<WorkflowTask | null> {
    const task = this.tasks.get(id);
    return task ? clone(task) : null;
  }

  async listTasks(workflowId: string): Promise<WorkflowTask[]> {
    return [...this.tasks.values()].filter((t) => t.workflow_id === workflowId).map(clone);
  }

  async updateTask(id: string, patch: Partial<WorkflowTask>): Promise<WorkflowTask> {
    const task = this.tasks.get(id);
    if (!task) throw new Error('TASK_NOT_FOUND');
    Object.assign(task, patch, { updated_at: patch.updated_at ?? new Date() });
    return clone(task);
  }

  async appendEvent(event: WorkflowEvent): Promise<WorkflowEventApplyResult> {
    const key = `${event.workflow_id}|${event.dedup_key}`;
    if (this.events.has(key)) return { applied: false, reason: 'DUPLICATE_EVENT' };
    this.events.set(key, clone(event));
    this.eventList.push(clone(event));
    return { applied: true, event: clone(event) };
  }

  async listEvents(workflowId: string): Promise<WorkflowEvent[]> {
    return this.eventList.filter((e) => e.workflow_id === workflowId).map(clone);
  }
}

/** Durable qua restart (kill/recover) — file JSON trong state dir, giống FileJobStore. */
export class FileWorkflowStore implements WorkflowStore {
  private readonly memory = new MemoryWorkflowStore();
  private readonly dir: string;
  private initialized = false;

  constructor(dir: string) {
    this.dir = dir;
  }

  /** Nạp lại toàn bộ state từ disk (worker restart). */
  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.dir, { recursive: true });
    this.initialized = true;
    const files = await fs.readdir(this.dir).catch(() => [] as string[]);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await fs.readFile(path.join(this.dir, file), 'utf8');
      const doc = JSON.parse(raw) as { kind: 'workflow' | 'task' | 'event'; data: unknown };
      if (doc.kind === 'workflow') await this.memory.insertWorkflow(doc.data as Workflow);
      if (doc.kind === 'task') await this.memory.insertTask(doc.data as WorkflowTask);
      if (doc.kind === 'event') await this.memory.appendEvent(doc.data as WorkflowEvent);
    }
  }

  private async persist(kind: 'workflow' | 'task' | 'event', id: string, data: unknown): Promise<void> {
    await this.init();
    if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('INVALID_ID');
    const target = path.join(this.dir, `${kind}-${id}.json`);
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ kind, data }), 'utf8');
    await fs.rename(tmp, target);
  }

  async insertWorkflow(wf: Workflow): Promise<void> {
    await this.memory.insertWorkflow(wf);
    await this.persist('workflow', wf.id, wf);
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    await this.init();
    return this.memory.getWorkflow(id);
  }

  async updateWorkflow(id: string, patch: Partial<Workflow>): Promise<Workflow> {
    const wf = await this.memory.updateWorkflow(id, patch);
    await this.persist('workflow', wf.id, wf);
    return wf;
  }

  async insertTask(task: WorkflowTask): Promise<void> {
    await this.memory.insertTask(task);
    await this.persist('task', task.id, task);
  }

  async getTask(id: string): Promise<WorkflowTask | null> {
    await this.init();
    return this.memory.getTask(id);
  }

  async listTasks(workflowId: string): Promise<WorkflowTask[]> {
    await this.init();
    return this.memory.listTasks(workflowId);
  }

  async updateTask(id: string, patch: Partial<WorkflowTask>): Promise<WorkflowTask> {
    const task = await this.memory.updateTask(id, patch);
    await this.persist('task', task.id, task);
    return task;
  }

  async appendEvent(event: WorkflowEvent): Promise<WorkflowEventApplyResult> {
    const result = await this.memory.appendEvent(event);
    if (result.applied) {
      // Tên file băm từ dedup_key (key có thể chứa ':'/ký tự không an toàn fs).
      const fileSafe = createHash('sha256').update(`${event.workflow_id}|${event.dedup_key}`).digest('hex');
      await this.persist('event', fileSafe, event);
    }
    return result;
  }

  async listEvents(workflowId: string): Promise<WorkflowEvent[]> {
    await this.init();
    return this.memory.listEvents(workflowId);
  }
}