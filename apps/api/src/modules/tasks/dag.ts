/**
 * Module xử lý và xác thực đồ thị có hướng không chu trình (DAG - Directed Acyclic Graph)
 * cho hệ thống Workflow Tasks & Campaign Plans.
 * 
 * Đảm bảo:
 * 1. Cycle Detection: Chặn đứng vòng lặp vô tận (Circular Dependency) khi tạo task hoặc plan.
 * 2. Cascade Failure: Tự động hủy các task con downstream khi task cha bị FAILED hoặc CANCELLED.
 */

export interface TaskNode {
  id: string;
  dependencies?: string[];
}

export interface DagValidationResult {
  valid: boolean;
  cycle?: string[];
  error?: string;
}

/**
 * Kiểm tra chu trình trong một danh sách các tasks và dependencies.
 * Sử dụng thuật toán DFS 3-color (0: Unvisited, 1: Visiting/On Stack, 2: Visited).
 * 
 * @param tasks Danh sách tasks cần kiểm tra
 * @returns DagValidationResult
 */
export function validateTaskGraph(tasks: TaskNode[]): DagValidationResult {
  const adj = new Map<string, string[]>();
  const allIds = new Set<string>();

  for (const t of tasks) {
    allIds.add(t.id);
    if (!adj.has(t.id)) {
      adj.set(t.id, []);
    }
    if (t.dependencies && t.dependencies.length > 0) {
      for (const depId of t.dependencies) {
        if (depId === t.id) {
          return {
            valid: false,
            cycle: [t.id, t.id],
            error: `Self-dependency detected: Task '${t.id}' cannot depend on itself`,
          };
        }
        adj.get(t.id)!.push(depId);
      }
    }
  }

  // 0 = unvisited, 1 = visiting (on current path), 2 = visited
  const state = new Map<string, number>();
  const parent = new Map<string, string>();
  let cyclePath: string[] | null = null;

  function dfs(u: string): boolean {
    state.set(u, 1);
    const neighbors = adj.get(u) || [];

    for (const v of neighbors) {
      // Nếu v không nằm trong danh sách task đang kiểm tra, bỏ qua (external dependency)
      if (!allIds.has(v)) continue;

      const vState = state.get(v) || 0;
      if (vState === 1) {
        // Phát hiện chu trình: u -> v trong đó v đang nằm trên stack
        const path: string[] = [v, u];
        let curr = u;
        while (parent.has(curr) && parent.get(curr) !== v) {
          curr = parent.get(curr)!;
          path.push(curr);
        }
        path.push(v);
        cyclePath = path.reverse();
        return true;
      }

      if (vState === 0) {
        parent.set(v, u);
        if (dfs(v)) return true;
      }
    }

    state.set(u, 2);
    return false;
  }

  for (const t of tasks) {
    if ((state.get(t.id) || 0) === 0) {
      if (dfs(t.id)) {
        const detected = cyclePath as string[] | null;
        return {
          valid: false,
          cycle: detected || [],
          error: `Circular dependency detected: ${detected ? detected.join(" -> ") : "Cycle detected"}`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Kiểm tra xem việc thêm quan hệ phụ thuộc (taskId depends on dependsOnTaskIds)
 * có tạo ra chu trình với các quan hệ đã lưu trong database hay không.
 */
export async function wouldCreateCycleInDb(
  client: { query: (sql: string, params: any[]) => Promise<any> },
  workspaceId: string,
  taskId: string,
  dependsOnTaskIds: string[]
): Promise<boolean> {
  if (!dependsOnTaskIds || dependsOnTaskIds.length === 0) return false;

  // Nếu taskId nằm ngay trong danh sách phụ thuộc -> self-dependency
  if (dependsOnTaskIds.includes(taskId)) return true;

  // Sử dụng Recursive CTE để tìm tất cả các tổ tiên (ancestors) của các task trong dependsOnTaskIds
  // Nếu taskId là tổ tiên của bất kỳ task nào mà nó muốn phụ thuộc, sẽ tạo thành chu trình!
  const sql = `
    WITH RECURSIVE ancestors AS (
      SELECT depends_on_task_id AS id
      FROM task_dependencies
      WHERE task_id = ANY($1::uuid[]) AND workspace_id = $2
      UNION
      SELECT td.depends_on_task_id
      FROM task_dependencies td
      JOIN ancestors a ON td.task_id = a.id
      WHERE td.workspace_id = $2
    )
    SELECT 1 FROM ancestors WHERE id = $3 LIMIT 1;
  `;

  const res = await client.query(sql, [dependsOnTaskIds, workspaceId, taskId]);
  return res.rows.length > 0;
}

/**
 * Lan truyền trạng thái thất bại / hủy (Cascade Failure):
 * Khi một task cha bị FAILED hoặc CANCELLED, tìm toàn bộ các task con phụ thuộc
 * đang ở trạng thái 'pending', 'queued', 'blocked' và chuyển chúng thành 'cancelled'
 * kèm lý do UPSTREAM_TASK_FAILED. Đồng thời đánh dấu 'failed' trong plan_task_outbox
 * để worker không bao giờ kéo các task này về chạy.
 */
export async function propagateUpstreamTaskFailure(
  client: { query: (sql: string, params: any[]) => Promise<any> },
  workspaceId: string,
  failedTaskId: string,
  upstreamStatus: string
): Promise<string[]> {
  const cascadeSql = `
    WITH RECURSIVE downstream AS (
      SELECT task_id
      FROM task_dependencies
      WHERE depends_on_task_id = $1 AND workspace_id = $2
      UNION
      SELECT td.task_id
      FROM task_dependencies td
      JOIN downstream d ON td.depends_on_task_id = d.task_id
      WHERE td.workspace_id = $2
    )
    UPDATE workflow_tasks
    SET status = 'cancelled',
        error_details = jsonb_build_object(
          'code', 'UPSTREAM_TASK_FAILED',
          'upstream_task_id', $1::text,
          'upstream_status', $3::text,
          'message', 'Task cancelled automatically because upstream prerequisite task failed or was cancelled'
        ),
        completed_at = NOW(),
        updated_at = NOW()
    WHERE workspace_id = $2
      AND id IN (SELECT task_id FROM downstream)
      AND status IN ('pending', 'queued', 'running')
    RETURNING id;
  `;

  const res = await client.query(cascadeSql, [failedTaskId, workspaceId, upstreamStatus]);
  const cancelledIds: string[] = res.rows.map((r: { id: string }) => r.id);

  if (cancelledIds.length > 0) {
    // Đánh dấu failed trong plan_task_outbox để worker bỏ qua
    await client.query(
      `UPDATE plan_task_outbox
       SET status = 'failed',
           error_code = 'UPSTREAM_TASK_FAILED',
           lease_until = NULL
       WHERE workspace_id = $1
         AND task_id = ANY($2::uuid[])
         AND status IN ('pending', 'claimed')`,
      [workspaceId, cancelledIds]
    );
  }

  return cancelledIds;
}
