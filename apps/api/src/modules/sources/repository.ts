import { query } from "@/lib/db";
import { CreateSourceInput } from "./schemas";

export interface SourceRow {
  id: string;
  workspace_id: string;
  title: string;
  kind: "text" | "pdf" | "url";
  url_or_blob: string;
  category: string;
  status: string;
  version: number;
  content_hash?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export async function listSources(
  workspaceId: string,
  filters?: { status?: string; category?: string }
): Promise<SourceRow[]> {
  let sql = `
    SELECT id, workspace_id, title, kind, url_or_blob, category, status, 
           version, content_hash, reviewed_by, reviewed_at, deleted_at, 
           created_at, updated_at
    FROM sources 
    WHERE workspace_id = $1 AND deleted_at IS NULL
  `;
  const params: any[] = [workspaceId];

  if (filters?.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }

  if (filters?.category) {
    params.push(filters.category);
    sql += ` AND category = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC`;
  const res = await query<SourceRow>(sql, params);
  return res.rows;
}

export async function getSourceById(
  workspaceId: string,
  sourceId: string
): Promise<SourceRow | null> {
  const sql = `
    SELECT id, workspace_id, title, kind, url_or_blob, category, status, 
           version, content_hash, reviewed_by, reviewed_at, deleted_at, 
           created_at, updated_at
    FROM sources 
    WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
  `;
  const res = await query<SourceRow>(sql, [workspaceId, sourceId]);
  return res.rows[0] || null;
}

export async function createSource(
  workspaceId: string,
  data: CreateSourceInput
): Promise<SourceRow> {
  const sql = `
    INSERT INTO sources (workspace_id, title, kind, url_or_blob, category, status, version, content_hash)
    VALUES ($1, $2, $3, $4, $5, 'imported', 1, $6)
    RETURNING *
  `;
  const res = await query<SourceRow>(sql, [
    workspaceId,
    data.title,
    data.kind,
    data.url_or_blob,
    data.category,
    data.content_hash || null,
  ]);
  return res.rows[0];
}

export async function updateSourceReview(
  workspaceId: string,
  sourceId: string,
  decision: "approved" | "rejected" | "revoked",
  reviewerId: string
): Promise<SourceRow> {
  const sql = `
    UPDATE sources
    SET status = $1,
        version = version + 1,
        reviewed_by = $2,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE workspace_id = $3 AND id = $4
    RETURNING *
  `;
  const res = await query<SourceRow>(sql, [decision, reviewerId, workspaceId, sourceId]);
  return res.rows[0];
}

export async function softDeleteSource(
  workspaceId: string,
  sourceId: string
): Promise<void> {
  const sql = `
    UPDATE sources
    SET status = 'deleted',
        deleted_at = NOW(),
        updated_at = NOW()
    WHERE workspace_id = $1 AND id = $2
  `;
  await query(sql, [workspaceId, sourceId]);
}
