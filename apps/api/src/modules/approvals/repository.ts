import type { PoolClient } from "pg";
import { query, withTransaction } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { CreateApprovalInput, ReviewApprovalInput } from "./schemas";

export interface ApprovalRow {
  id: string;
  workspace_id: string;
  target_type: string;
  target_id: string;
  target_version: number;
  target_hash: string;
  status: string;
  decision?: string | null;
  actor_id?: string | null;
  actor_role?: string | null;
  review_note?: string | null;
  invalidated_reason?: string | null;
  invalidated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TargetMetadata {
  id: string;
  version: number;
  content_hash: string;
  status: string;
}

export async function createApprovalRecord(
  workspaceId: string,
  input: CreateApprovalInput
): Promise<ApprovalRow> {
  const sql = `
    INSERT INTO approvals (
      workspace_id, target_type, target_id, target_version, target_hash, review_note
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const res = await query<ApprovalRow>(sql, [
    workspaceId,
    input.target_type,
    input.target_id,
    input.target_version,
    input.target_hash,
    input.review_note || null,
  ]);
  return res.rows[0];
}

export async function getApprovalById(
  workspaceId: string,
  approvalId: string
): Promise<ApprovalRow | null> {
  const sql = `SELECT * FROM approvals WHERE workspace_id = $1 AND id = $2`;
  const res = await query<ApprovalRow>(sql, [workspaceId, approvalId]);
  return res.rows[0] || null;
}

export async function listApprovals(
  workspaceId: string,
  filters?: { target_type?: string; status?: string }
): Promise<ApprovalRow[]> {
  let sql = `SELECT * FROM approvals WHERE workspace_id = $1`;
  const params: any[] = [workspaceId];

  if (filters?.target_type) {
    params.push(filters.target_type);
    sql += ` AND target_type = $${params.length}`;
  }

  if (filters?.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC`;
  const res = await query<ApprovalRow>(sql, params);
  return res.rows;
}

export async function getTargetInfo(
  workspaceId: string,
  targetType: string,
  targetId: string,
  client?: PoolClient,
  forUpdate: boolean = false
): Promise<TargetMetadata | null> {
  const runQuery = client
    ? <T extends import("pg").QueryResultRow = any>(text: string, params?: any[]) => client.query<T>(text, params)
    : query;
  const lock = forUpdate ? " FOR UPDATE" : "";

  if (targetType === "content") {
    const res = await runQuery<{ id: string; version: number; content_hash: string; status: string }>(
      `SELECT id, COALESCE(current_version, 1) as version, COALESCE(content_hash, '') as content_hash, status 
       FROM contents 
       WHERE workspace_id = $1 AND id = $2${lock}`,
      [workspaceId, targetId]
    );
    if (res.rows.length === 0) return null;
    return {
      id: res.rows[0].id,
      version: Number(res.rows[0].version),
      content_hash: res.rows[0].content_hash,
      status: res.rows[0].status,
    };
  }

  if (targetType === "source") {
    const res = await runQuery<{ id: string; version: number; content_hash: string; status: string }>(
      `SELECT id, version, COALESCE(content_hash, '') as content_hash, status 
       FROM sources 
       WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL${lock}`,
      [workspaceId, targetId]
    );
    if (res.rows.length === 0) return null;
    return {
      id: res.rows[0].id,
      version: Number(res.rows[0].version),
      content_hash: res.rows[0].content_hash,
      status: res.rows[0].status,
    };
  }

  if (targetType === "artifact") {
    const res = await runQuery<{ id: string; version: number; content_hash: string }>(
      `SELECT id, version, content_hash 
       FROM content_artifacts 
       WHERE workspace_id = $1 AND id = $2${lock}`,
      [workspaceId, targetId]
    );
    if (res.rows.length === 0) return null;
    return {
      id: res.rows[0].id,
      version: Number(res.rows[0].version),
      content_hash: res.rows[0].content_hash,
      status: "ready_for_handoff",
    };
  }

  if (targetType === "task") {
    const res = await runQuery<{ id: string; version: number; status: string }>(
      `SELECT id, input_version as version, status 
       FROM workflow_tasks 
       WHERE workspace_id = $1 AND id = $2${lock}`,
      [workspaceId, targetId]
    );
    if (res.rows.length === 0) return null;
    return {
      id: res.rows[0].id,
      version: Number(res.rows[0].version),
      content_hash: "",
      status: res.rows[0].status,
    };
  }

  if (targetType === "campaign") {
    const res = await runQuery<{ id: string }>(
      `SELECT id 
       FROM campaigns 
       WHERE workspace_id = $1 AND id = $2${lock}`,
      [workspaceId, targetId]
    );
    if (res.rows.length === 0) return null;
    return {
      id: res.rows[0].id,
      version: 1,
      content_hash: "",
      status: "active",
    };
  }

  return null;
}

export async function executeApprovalReviewTransaction(
  workspaceId: string,
  approvalId: string,
  input: ReviewApprovalInput,
  actorId: string,
  actorRole: string,
  targetType?: string,
  targetId?: string
): Promise<ApprovalRow> {
  return withTransaction(async (client) => {
    // 1. SELECT ... FOR UPDATE trên bản ghi approval để tuần tự hóa các yêu cầu phê duyệt đồng thời (chống TOCTOU race condition)
    const approvalRes = await client.query<ApprovalRow>(
      `SELECT * FROM approvals WHERE workspace_id = $1 AND id = $2 FOR UPDATE`,
      [workspaceId, approvalId]
    );
    const approval = approvalRes.rows[0];
    if (!approval) {
      throw new AppError(404, "NOT_FOUND", "Approval record not found");
    }

    // 2. Chặn xung đột: Kiểm tra trạng thái pending ngay bên trong transaction
    if (approval.status !== "pending") {
      throw new AppError(
        409,
        "APPROVAL_ALREADY_REVIEWED",
        `Approval record has already been reviewed (current status: ${approval.status}). Concurrent reviews are not allowed.`
      );
    }

    const effectiveTargetType = targetType || approval.target_type;
    const effectiveTargetId = targetId || approval.target_id;

    // 3. Khóa và kiểm tra đối tượng đích trong cùng transaction (FOR UPDATE)
    const target = await getTargetInfo(workspaceId, effectiveTargetType, effectiveTargetId, client, true);
    if (!target) {
      throw new AppError(404, "NOT_FOUND", `Approval target '${effectiveTargetType}:${effectiveTargetId}' not found`);
    }

    // 4. Atomic Optimistic Concurrency Control: So khớp expected_version và expected_hash
    if (target.version !== input.expected_version) {
      throw new AppError(
        409,
        "VERSION_CONFLICT",
        `Stale version conflict. Target current version is ${target.version}, but expected ${input.expected_version}. Please reload.`
      );
    }

    if (target.content_hash && target.content_hash !== input.expected_hash) {
      throw new AppError(
        409,
        "CONTENT_HASH_MISMATCH",
        `Content hash mismatch. Target content was modified after review request was generated. Please reload.`
      );
    }

    // 5. Cập nhật bản ghi approval với điều kiện atomic: status = 'pending'
    const nextStatus = input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "revoked";

    const sql = `
      UPDATE approvals
      SET status = $1,
          decision = $2,
          actor_id = $3,
          actor_role = $4,
          review_note = COALESCE($5, review_note),
          updated_at = NOW()
      WHERE workspace_id = $6 AND id = $7 AND status = 'pending'
      RETURNING *
    `;
    const updatedApprovalRes = await client.query<ApprovalRow>(sql, [
      nextStatus,
      input.decision,
      actorId,
      actorRole,
      input.review_note || null,
      workspaceId,
      approvalId,
    ]);

    if (updatedApprovalRes.rowCount === 0) {
      throw new AppError(
        409,
        "APPROVAL_ALREADY_REVIEWED",
        `Approval record was modified concurrently. Concurrent reviews are not allowed.`
      );
    }

    // 6. Cập nhật đối tượng đích với điều kiện version nguyên tử
    if (effectiveTargetType === "content") {
      if (input.decision === "approve") {
        const updateContent = await client.query(
          `UPDATE contents 
           SET status = 'approved', approved_by = $1, published_at = NOW() 
           WHERE workspace_id = $2 AND id = $3 AND COALESCE(current_version, 1) = $4`,
          [actorId, workspaceId, effectiveTargetId, input.expected_version]
        );
        if (updateContent.rowCount === 0) {
          throw new AppError(409, "VERSION_CONFLICT", "Target content version was modified concurrently");
        }
      } else {
        const updateContent = await client.query(
          `UPDATE contents 
           SET status = 'draft', approved_by = NULL, published_at = NULL 
           WHERE workspace_id = $1 AND id = $2 AND COALESCE(current_version, 1) = $3`,
          [workspaceId, effectiveTargetId, input.expected_version]
        );
        if (updateContent.rowCount === 0) {
          throw new AppError(409, "VERSION_CONFLICT", "Target content version was modified concurrently");
        }
      }
    } else if (effectiveTargetType === "source") {
      const sourceStatus = input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "revoked";
      const updateSource = await client.query(
        `UPDATE sources 
         SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW() 
         WHERE workspace_id = $3 AND id = $4 AND version = $5`,
        [sourceStatus, actorId, workspaceId, effectiveTargetId, input.expected_version]
      );
      if (updateSource.rowCount === 0) {
        throw new AppError(409, "VERSION_CONFLICT", "Target source version was modified concurrently");
      }
    } else if (effectiveTargetType === "task") {
      const taskStatus = input.decision === "approve" ? "queued" : "cancelled";
      const updateTask = await client.query(
        `UPDATE workflow_tasks 
         SET status = $1, updated_at = NOW() 
         WHERE workspace_id = $2 AND id = $3 AND input_version = $4`,
        [taskStatus, workspaceId, effectiveTargetId, input.expected_version]
      );
      if (updateTask.rowCount === 0) {
        throw new AppError(409, "VERSION_CONFLICT", "Target task version was modified concurrently");
      }
    }

    // 7. Cascade Invalidation nguyên tử trong transaction: Nếu thu hồi nguồn (source revoke)
    if (input.decision === "revoke" && effectiveTargetType === "source") {
      await invalidateApprovalsForTarget(
        workspaceId,
        "source",
        effectiveTargetId,
        "SOURCE_REVOKED",
        client
      );
    }

    return updatedApprovalRes.rows[0];
  });
}

export async function applyApprovalReview(
  workspaceId: string,
  approvalId: string,
  input: ReviewApprovalInput,
  actorId: string,
  actorRole: string
): Promise<ApprovalRow> {
  const nextStatus = input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "revoked";

  const sql = `
    UPDATE approvals
    SET status = $1,
        decision = $2,
        actor_id = $3,
        actor_role = $4,
        review_note = COALESCE($5, review_note),
        updated_at = NOW()
    WHERE workspace_id = $6 AND id = $7
    RETURNING *
  `;
  const res = await query<ApprovalRow>(sql, [
    nextStatus,
    input.decision,
    actorId,
    actorRole,
    input.review_note || null,
    workspaceId,
    approvalId,
  ]);

  return res.rows[0];
}

export async function updateTargetApprovalStatus(
  workspaceId: string,
  targetType: string,
  targetId: string,
  decision: "approve" | "reject" | "revoke",
  actorId: string
): Promise<void> {
  if (targetType === "content") {
    if (decision === "approve") {
      await query(
        `UPDATE contents 
         SET status = 'approved', approved_by = $1, updated_at = NOW() 
         WHERE workspace_id = $2 AND id = $3`,
        [actorId, workspaceId, targetId]
      );
    } else {
      await query(
        `UPDATE contents 
         SET status = 'draft', approved_by = NULL, published_at = NULL, updated_at = NOW() 
         WHERE workspace_id = $2 AND id = $3`,
        [workspaceId, targetId]
      );
    }
  }

  if (targetType === "source") {
    const sourceStatus = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "revoked";
    await query(
      `UPDATE sources 
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW() 
       WHERE workspace_id = $3 AND id = $4`,
      [sourceStatus, actorId, workspaceId, targetId]
    );
  }

  if (targetType === "task") {
    const taskStatus = decision === "approve" ? "queued" : "cancelled";
    await query(
      `UPDATE workflow_tasks 
       SET status = $1, updated_at = NOW() 
       WHERE workspace_id = $2 AND id = $3`,
      [taskStatus, workspaceId, targetId]
    );
  }
}

export async function invalidateApprovalsForTarget(
  workspaceId: string,
  targetType: string,
  targetId: string,
  reason: string = "STALE_VERSION",
  client?: PoolClient
): Promise<number> {
  const sql = `
    UPDATE approvals
    SET status = 'revoked',
        invalidated_reason = $1,
        invalidated_at = NOW(),
        updated_at = NOW()
    WHERE workspace_id = $2 AND target_type = $3 AND target_id = $4 AND status IN ('approved', 'pending')
  `;
  if (client) {
    const res = await client.query(sql, [reason, workspaceId, targetType, targetId]);
    return res.rowCount || 0;
  }
  const res = await query(sql, [reason, workspaceId, targetType, targetId]);
  return res.rowCount || 0;
}
