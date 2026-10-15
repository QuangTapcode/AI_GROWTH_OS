import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import {
  type Workflow,
  type WorkflowEvent,
  type WorkflowEventApplyResult,
  type WorkflowTask,
} from './types';
import type { WorkflowStore } from './WorkflowStore';

/* MY-03 DB store tren migration 002. Schema 002 dung UUID cho id,
 * workspace_id, task_id, result_ref; CHECK khong co 'blocked'.
 * Quy uoc: id string tu do ('wf-1') map deterministic sang UUID de ghi
 * cot id; id goc luon giu trong payload de doc lai tra dung. */

export const WORKFLOW_MARKER_OPERATION = '__workflow__';
const WORKFLOW_MARKER_ROLE = 'growth_lead';
const EVENT_MARKER_OPERATION = '__workflow_event__';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toDbUuid(id: string): string {
  if (UUID_RE.test(id)) return id.toLowerCase();
  const h = createHash('sha256').update(id).digest('hex');
  const p1 = h.slice(0, 8);
  const p2 = h.slice(8, 12);
  const p3 = `5${h.slice(13, 16)}`;
  const p4 = `a${h.slice(17, 20)}`;
  const p5 = h.slice(20, 32);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

function parseJson(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const p: unknown = JSON.parse(value);
      if (p !== null && typeof p === 'object' && !Array.isArray(p)) {
        return p as Record<string, unknown>;
      }
    } catch { return {}; }
  }
  return {};
}

async function ensureWorkspace(pool: Pool, wsDb: string): Promise<void> {
  await pool.query(
    'INSERT INTO workspaces (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
    [wsDb, `workflow-${wsDb.slice(0, 8)}`, `wf-${wsDb}`],
  );
}

function connStr(explicit?: string): string {
  if (explicit) return explicit;
  const url = process.env.DATABASE_URL;
  if (url) return url;
  const host = process.env.PG_HOST ?? '127.0.0.1';
  const port = process.env.PG_PORT ?? '15432';
  const user = process.env.PG_USER ?? 'ai_growth_dev';
  const pass = process.env.PG_PASSWORD ?? '';
  const db = process.env.PG_DATABASE ?? 'ai_growth_os';
  return `postgres://${user}:${pass}@${host}:${port}/${db}`;
}

type TaskRow = {
  id: string;
  operation: string;
  status: string;
  payload: unknown;
  result_ref: string | null;
  error_details: unknown;
  retry_count: number;
  max_retries: number;
  deps: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

function rowToTask(row: TaskRow, workflowId: string): WorkflowTask {
  const p = parseJson(row.payload);
  const payloadDeps = Array.isArray(p.depends_on) ? (p.depends_on as unknown[]) : [];
  const depsRaw = payloadDeps.length
    ? payloadDeps
    : Array.isArray(row.deps)
    ? (row.deps as unknown[])
    : [];
  const deps = depsRaw.map((d) => String(parseJson(d as unknown).orig_id ?? d));
  const details = parseJson(row.error_details);
  const code =
    details.code !== null && details.code !== undefined
      ? String(details.code)
      : null;
  let state = row.status as WorkflowTask['state'];
  if (row.status === 'failed' && code === 'DEPENDENCY_FAILED') state = 'blocked';
  return {
    id: String(p.orig_id ?? row.id),
    workflow_id: workflowId,
    operation: row.operation as WorkflowTask['operation'],
    depends_on: deps.map((d) => String(parseJson(d as unknown).orig_id ?? d)),
    state,
    attempt: row.retry_count,
    max_attempts: row.max_retries,
    input_refs:
      p.input_refs !== null && typeof p.input_refs === 'object'
        ? (p.input_refs as Record<string, unknown>)
        : {},
    output_artifact_ref:
      p.output_ref !== null && p.output_ref !== undefined
        ? String(p.output_ref)
        : null,
    job_id:
      p.job_id !== null && p.job_id !== undefined ? String(p.job_id) : null,
    requires_approval: Boolean(p.requires_approval),
    error_code: code,
    error_message:
      details.message !== null && details.message !== undefined
        ? String(details.message)
        : null,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

export class DbWorkflowStore implements WorkflowStore {
  private readonly pool: Pool;

  constructor(connectionString?: string) {
    this.pool = new Pool({ connectionString: connStr(connectionString), max: 5 });
  }

  async destroy(): Promise<void> {
    await this.pool.end();
  }

  async insertWorkflow(wf: Workflow): Promise<void> {
    const id = toDbUuid(wf.id);
    const ws = toDbUuid(wf.workspace_id);
    await ensureWorkspace(this.pool, ws);
    await this.pool.query(
      `INSERT INTO workflow_tasks
        (id, workspace_id, role, operation, status, payload, retry_count, max_retries, started_at)
       VALUES ($1,$2,$3,$4,$5,$6,0,0,NULL)`,
      [
        id,
        ws,
        WORKFLOW_MARKER_ROLE,
        WORKFLOW_MARKER_OPERATION,
        'pending',
        JSON.stringify({ kind: 'workflow', workflow_id: wf.id, state: wf.state }),
      ],
    );
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    const res = await this.pool.query(
      `SELECT t.id, t.operation, t.status, t.payload, t.result_ref, t.error_details,
              t.retry_count, t.max_retries, t.created_at, t.updated_at
       FROM workflow_tasks t WHERE t.id = $1 AND t.operation = $2`,
      [toDbUuid(id), WORKFLOW_MARKER_OPERATION],
    );
    const r = res.rows[0] as TaskRow | undefined;
    if (!r) return null;
    const p = parseJson(r.payload);
    return {
      id: String(p.workflow_id ?? id),
      workspace_id: String(p.workspace_id ?? ''),
      state: (p.state as Workflow['state'] ?? 'running'),
      created_at: new Date(r.created_at),
      updated_at: new Date(r.updated_at),
    };
  }

  async updateWorkflow(id: string, patch: Partial<Workflow>): Promise<Workflow> {
    const cur = await this.getWorkflow(id);
    if (!cur) throw new Error('WORKFLOW_NOT_FOUND');
    const ws = toDbUuid(cur.workspace_id);
    await ensureWorkspace(this.pool, ws);
    await this.pool.query(
      `UPDATE workflow_tasks
        SET payload = $2::jsonb, updated_at = NOW()
       WHERE id = $1 AND operation = $3`,
      [
        toDbUuid(id),
        JSON.stringify({
          kind: 'workflow',
          workflow_id: cur.id,
          workspace_id: cur.workspace_id,
          state: patch.state ?? cur.state,
        }),
        WORKFLOW_MARKER_OPERATION,
      ],
    );
    return { ...cur, ...patch, updated_at: new Date() };
  }

  async insertTask(task: WorkflowTask): Promise<void> {
    const id = toDbUuid(task.id);
    const ws = toDbUuid(task.workflow_id);
    await ensureWorkspace(this.pool, ws);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO workflow_tasks
          (id, workspace_id, role, operation, status, payload, retry_count, max_retries, started_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          ws,
          WORKFLOW_MARKER_ROLE,
          task.operation,
          task.state,
          JSON.stringify({
            orig_id: task.id,
            workflow_id: task.workflow_id,
            depends_on: task.depends_on,
            input_refs: task.input_refs,
            output_ref: task.output_artifact_ref,
            requires_approval: task.requires_approval,
            job_id: task.job_id,
          }),
          task.attempt,
          task.max_attempts,
          task.state === 'pending' ? null : task.created_at.toISOString(),
        ],
      );
      for (const d of task.depends_on) {
        await client.query(
          'INSERT INTO task_dependencies (task_id, depends_on_task_id, workspace_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [id, toDbUuid(d), ws],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      const e = err as { code?: string };
      if (e?.code === '23505') throw new Error('TASK_EXISTS');
      throw err;
    } finally {
      client.release();
    }
  }

  async getTask(id: string): Promise<WorkflowTask | null> {
    const res = await this.pool.query(
      `SELECT t.id, t.operation, t.status, t.payload, t.result_ref, t.error_details,
              t.retry_count, t.max_retries, t.created_at, t.updated_at,
              COALESCE((SELECT json_agg(td.depends_on_task_id) FROM task_dependencies td WHERE td.task_id = t.id), '[]'::json) AS deps
       FROM workflow_tasks t WHERE t.id = $1 AND t.operation != $2`,
      [toDbUuid(id), WORKFLOW_MARKER_OPERATION],
    );
    const r = res.rows[0] as TaskRow | undefined;
    if (!r) return null;
    const wfId = String(parseJson(r.payload).workflow_id ?? '');
    return rowToTask(r, wfId);
  }

  async listTasks(workflowId: string): Promise<WorkflowTask[]> {
    const res = await this.pool.query(
      `SELECT t.id, t.operation, t.status, t.payload, t.result_ref, t.error_details,
              t.retry_count, t.max_retries, t.created_at, t.updated_at,
              COALESCE((SELECT json_agg(td.depends_on_task_id) FROM task_dependencies td WHERE td.task_id = t.id), '[]'::json) AS deps
       FROM workflow_tasks t WHERE t.operation != $1 AND t.payload->>'workflow_id' = $2 ORDER BY t.created_at ASC`,
      [WORKFLOW_MARKER_OPERATION, workflowId],
    );
    return (res.rows as TaskRow[]).map((r) => rowToTask(r, workflowId));
  }

  async updateTask(id: string, patch: Partial<WorkflowTask>): Promise<WorkflowTask> {
    const cur = await this.getTask(id);
    if (!cur) throw new Error('TASK_NOT_FOUND');
    const state = patch.state ?? cur.state;
    const attempt = patch.attempt ?? (patch.state === 'pending' ? 0 : cur.attempt);
    const maxA = patch.max_attempts ?? cur.max_attempts;
    const code = patch.error_code ?? cur.error_code;
    const msg = patch.error_message ?? cur.error_message;
    await this.pool.query(
      `UPDATE workflow_tasks SET status = $1::text,
        payload = payload || $2::jsonb, error_details = $3::jsonb,
        retry_count = $4::int, max_retries = $5::int,
        completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
        updated_at = NOW() WHERE id = $6::uuid`,
      [
        state === 'blocked' ? 'failed' : state,
        JSON.stringify({
          input_refs: patch.input_refs ?? cur.input_refs,
          output_ref: patch.output_artifact_ref ?? cur.output_artifact_ref,
          requires_approval: patch.requires_approval ?? cur.requires_approval,
          job_id: patch.job_id ?? cur.job_id,
        }),
        code !== null || msg !== null ? JSON.stringify({ code, message: msg }) : null,
        attempt,
        maxA,
        toDbUuid(id),
      ],
    );
    const out = await this.getTask(id);
    if (!out) throw new Error('TASK_NOT_FOUND');
    return out;
  }

  async appendEvent(event: WorkflowEvent): Promise<WorkflowEventApplyResult> {
    const ws = toDbUuid(event.workflow_id);
    await ensureWorkspace(this.pool, ws);
    // Dedup: kiem tra event co cung dedup_key trong cung workflow da chua
    const existing = await this.pool.query(
      `SELECT id FROM workflow_tasks
       WHERE operation = $1 AND payload->>'workflow_id' = $2 AND payload->>'dedup_key' = $3
       LIMIT 1`,
      [EVENT_MARKER_OPERATION, event.workflow_id, event.dedup_key],
    );
    if (existing.rows.length > 0) {
      return { applied: false, reason: 'DUPLICATE_EVENT' };
    }
    const id = toDbUuid(event.id);
    await this.pool.query(
      `INSERT INTO workflow_tasks
        (id, workspace_id, role, operation, status, payload, retry_count, max_retries, started_at)
       VALUES ($1,$2,$3,$4,$5,$6,0,0,NULL)`,
      [
        id,
        ws,
        WORKFLOW_MARKER_ROLE,
        EVENT_MARKER_OPERATION,
        'completed',
        JSON.stringify({
          kind: 'event',
          workflow_id: event.workflow_id,
          task_id: event.task_id ?? null,
          type: event.type,
          dedup_key: event.dedup_key,
          payload: event.payload,
        }),
      ],
    );
    return { applied: true, event };
  }

  async listEvents(workflowId: string): Promise<WorkflowEvent[]> {
    const res = await this.pool.query(
      `SELECT t.id, t.operation, t.status, t.payload, t.result_ref, t.error_details,
              t.retry_count, t.max_retries, t.created_at, t.updated_at
       FROM workflow_tasks t
       WHERE t.operation = $1 AND t.payload->>'workflow_id' = $2
       ORDER BY t.created_at ASC`,
      [EVENT_MARKER_OPERATION, workflowId],
    );
    return (res.rows as TaskRow[]).map((r) => {
      const p = parseJson(r.payload) as Record<string, unknown>;
      return {
        id: String(p.id ?? r.id),
        workflow_id: String(p.workflow_id ?? workflowId),
        task_id:
          p.task_id !== null && p.task_id !== undefined ? String(p.task_id) : null,
        type: (p.type as WorkflowEvent['type'] ?? 'task_completed'),
        dedup_key: String(p.dedup_key ?? ''),
        payload: (p.payload as Record<string, unknown> ?? {}),
        created_at: new Date(r.created_at),
      };
    });
  }
}
