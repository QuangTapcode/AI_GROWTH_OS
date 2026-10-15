import pool, { query } from "@/lib/db";
import { CreateWorkflowTaskInput, UpdateTaskStatusInput, CreateArtifactInput } from "./schemas";

export interface WorkflowTaskRow {
  id: string;
  workspace_id: string;
  campaign_id?: string | null;
  role: string;
  operation: string;
  status: string;
  priority: number;
  input_version: number;
  context_snapshot_id?: string | null;
  payload: Record<string, any>;
  result_ref?: string | null;
  error_details?: Record<string, any> | null;
  retry_count: number;
  max_retries: number;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  dependencies?: string[];
}

export interface ContentArtifactRow {
  id: string;
  workspace_id: string;
  task_id?: string | null;
  version: number;
  content_hash: string;
  context_snapshot_id?: string | null;
  role: string;
  operation: string;
  artifact_type: string;
  title: string;
  storage: string;
  payload: Record<string, any>;
  evidence: any[];
  created_at: string;
}

export async function createTaskWithDependencies(
  workspaceId: string,
  input: CreateWorkflowTaskInput
): Promise<WorkflowTaskRow> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Tạo task chính trong bảng workflow_tasks
    const taskSql = `
      INSERT INTO workflow_tasks (
        workspace_id, campaign_id, role, operation, priority, 
        input_version, context_snapshot_id, payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const taskRes = await client.query(taskSql, [
      workspaceId,
      input.campaign_id || null,
      input.role,
      input.operation,
      input.priority,
      input.input_version,
      input.context_snapshot_id || null,
      JSON.stringify(input.payload || {}),
    ]);

    const createdTask = taskRes.rows[0];

    // 2. Thêm các dependencies nếu có
    if (input.dependencies && input.dependencies.length > 0) {
      for (const depId of input.dependencies) {
        await client.query(
          `INSERT INTO task_dependencies (task_id, depends_on_task_id, workspace_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [createdTask.id, depId, workspaceId]
        );
      }
    }

    await client.query("COMMIT");
    createdTask.dependencies = input.dependencies || [];
    return createdTask;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listTasks(
  workspaceId: string,
  filters?: { role?: string; status?: string; campaign_id?: string }
): Promise<WorkflowTaskRow[]> {
  let sql = `
    SELECT t.*, 
           COALESCE(
             (SELECT json_agg(td.depends_on_task_id) 
              FROM task_dependencies td 
              WHERE td.task_id = t.id), 
             '[]'::json
           ) as dependencies
    FROM workflow_tasks t
    WHERE t.workspace_id = $1
  `;
  const params: any[] = [workspaceId];

  if (filters?.role) {
    params.push(filters.role);
    sql += ` AND t.role = $${params.length}`;
  }

  if (filters?.status) {
    params.push(filters.status);
    sql += ` AND t.status = $${params.length}`;
  }

  if (filters?.campaign_id) {
    params.push(filters.campaign_id);
    sql += ` AND t.campaign_id = $${params.length}`;
  }

  sql += ` ORDER BY t.created_at DESC`;
  const res = await query<WorkflowTaskRow>(sql, params);
  return res.rows;
}

export async function getTaskById(
  workspaceId: string,
  taskId: string
): Promise<WorkflowTaskRow | null> {
  const sql = `
    SELECT t.*, 
           COALESCE(
             (SELECT json_agg(td.depends_on_task_id) 
              FROM task_dependencies td 
              WHERE td.task_id = t.id), 
             '[]'::json
           ) as dependencies
    FROM workflow_tasks t
    WHERE t.workspace_id = $1 AND t.id = $2
  `;
  const res = await query<WorkflowTaskRow>(sql, [workspaceId, taskId]);
  return res.rows[0] || null;
}

export async function updateTaskStatus(
  workspaceId: string,
  taskId: string,
  input: UpdateTaskStatusInput
): Promise<WorkflowTaskRow | null> {
  const isTerminal = input.status === "completed" || input.status === "failed" || input.status === "cancelled";
  const completedAtClause = isTerminal ? ", completed_at = NOW()" : "";
  const startedAtClause = input.status === "running" ? ", started_at = COALESCE(started_at, NOW())" : "";

  const sql = `
    UPDATE workflow_tasks
    SET status = $1,
        result_ref = COALESCE($2, result_ref),
        error_details = COALESCE($3, error_details),
        updated_at = NOW()
        ${completedAtClause}
        ${startedAtClause}
    WHERE workspace_id = $4 AND id = $5
    RETURNING *
  `;
  const res = await query<WorkflowTaskRow>(sql, [
    input.status,
    input.result_ref || null,
    input.error_details ? JSON.stringify(input.error_details) : null,
    workspaceId,
    taskId,
  ]);

  return res.rows[0] || null;
}

export async function createArtifact(
  workspaceId: string,
  input: CreateArtifactInput
): Promise<ContentArtifactRow> {
  const sql = `
    INSERT INTO content_artifacts (
      workspace_id, task_id, version, content_hash, context_snapshot_id,
      role, operation, artifact_type, title, storage, payload, evidence
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `;
  const res = await query<ContentArtifactRow>(sql, [
    workspaceId,
    input.task_id || null,
    input.version,
    input.content_hash,
    input.context_snapshot_id || null,
    input.role,
    input.operation,
    input.artifact_type,
    input.title,
    input.storage,
    JSON.stringify(input.payload || {}),
    JSON.stringify(input.evidence || []),
  ]);

  return res.rows[0];
}

export async function listArtifacts(
  workspaceId: string,
  filters?: { role?: string; artifact_type?: string }
): Promise<ContentArtifactRow[]> {
  let sql = `SELECT * FROM content_artifacts WHERE workspace_id = $1`;
  const params: any[] = [workspaceId];

  if (filters?.role) {
    params.push(filters.role);
    sql += ` AND role = $${params.length}`;
  }

  if (filters?.artifact_type) {
    params.push(filters.artifact_type);
    sql += ` AND artifact_type = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC`;
  const res = await query<ContentArtifactRow>(sql, params);
  return res.rows;
}

export async function getArtifactById(
  workspaceId: string,
  artifactId: string
): Promise<ContentArtifactRow | null> {
  const sql = `SELECT * FROM content_artifacts WHERE workspace_id = $1 AND id = $2`;
  const res = await query<ContentArtifactRow>(sql, [workspaceId, artifactId]);
  return res.rows[0] || null;
}
