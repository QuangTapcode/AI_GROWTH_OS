import { query } from "../../lib/db";
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
  targetId: string
): Promise<TargetMetadata | null> {
  if (targetType === "content") {
    const res = await query<{ id: string; version: number; content_hash: string; status: string }>(
      `SELECT id, COALESCE(current_version, 1) as version, COALESCE(content_hash, '') as content_hash, status 
       FROM contents 
       WHERE workspace_id = $1 AND id = $2`,
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
    const res = await query<{ id: string; version: number; content_hash: string; status: string }>(
      `SELECT id, version, COALESCE(content_hash, '') as content_hash, status 
       FROM sources 
       WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL`,
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
    const res = await query<{ id: string; version: number; content_hash: string }>(
      `SELECT id, version, content_hash 
       FROM content_artifacts 
       WHERE workspace_id = $1 AND id = $2`,
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

  return null;
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
}

export async function invalidateApprovalsForTarget(
  workspaceId: string,
  targetType: string,
  targetId: string,
  reason: string = "STALE_VERSION"
): Promise<number> {
  const sql = `
    UPDATE approvals
    SET status = 'revoked',
        invalidated_reason = $1,
        invalidated_at = NOW(),
        updated_at = NOW()
    WHERE workspace_id = $2 AND target_type = $3 AND target_id = $4 AND status = 'approved'
  `;
  const res = await query(sql, [reason, workspaceId, targetType, targetId]);
  return res.rowCount || 0;
}
