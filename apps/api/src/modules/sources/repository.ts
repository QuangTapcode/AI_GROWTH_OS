import type { PoolClient } from "pg";
import { query, withTransaction } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { CreateSourceInput, ReviewSourceInput } from "./schemas";
import { invalidateApprovalsForTarget } from "../approvals/repository";
import { policyFor } from "../research/sourcePolicy";

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
  // URL sources on the Research source policy carry their reuse terms, so the
  // worker can ingest them; other URLs stay without a license and are not fetched.
  const policy = data.kind === "url" ? policyFor(data.url_or_blob) : null;
  const sql = `
    INSERT INTO sources (workspace_id, title, kind, url_or_blob, category, status, version, content_hash, license, attribution, source_url)
    VALUES ($1, $2, $3, $4, $5, 'imported', 1, $6, $7, $8, $9)
    RETURNING *
  `;
  const res = await query<SourceRow>(sql, [
    workspaceId,
    data.title,
    data.kind,
    data.url_or_blob,
    data.category,
    data.content_hash || null,
    policy?.license ?? null,
    policy?.attribution ?? null,
    policy ? data.url_or_blob : null,
  ]);
  return res.rows[0];
}

export async function updateSourceReview(
  workspaceId: string,
  sourceId: string,
  decision: "approved" | "rejected" | "revoked",
  reviewerId: string,
  expectedVersion?: number,
  client?: PoolClient
): Promise<SourceRow> {
  let sql = `
    UPDATE sources
    SET status = $1,
        version = version + 1,
        reviewed_by = $2,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE workspace_id = $3 AND id = $4
  `;
  const params: any[] = [decision, reviewerId, workspaceId, sourceId];
  if (expectedVersion !== undefined) {
    params.push(expectedVersion);
    sql += ` AND version = $${params.length}`;
  }
  sql += ` RETURNING *`;
  const runQuery = client
    ? <T extends import("pg").QueryResultRow = any>(text: string, p?: any[]) => client.query<T>(text, p)
    : query;
  const res = await runQuery<SourceRow>(sql, params);
  if (res.rows.length === 0) {
    throw new AppError(409, "VERSION_CONFLICT", "Source version conflict or source not found");
  }
  return res.rows[0];
}

export async function softDeleteSource(
  workspaceId: string,
  sourceId: string,
  client?: PoolClient
): Promise<void> {
  const sql = `
    UPDATE sources
    SET status = 'deleted',
        deleted_at = NOW(),
        updated_at = NOW()
    WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
  `;
  if (client) {
    await client.query(sql, [workspaceId, sourceId]);
  } else {
    await query(sql, [workspaceId, sourceId]);
  }
}

export async function executeSourceReviewTransaction(
  workspaceId: string,
  sourceId: string,
  input: ReviewSourceInput,
  reviewerId: string
): Promise<SourceRow> {
  return withTransaction(async (client) => {
    // 1. SELECT ... FOR UPDATE trên bản ghi nguồn
    const checkRes = await client.query<SourceRow>(
      `SELECT * FROM sources WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [workspaceId, sourceId]
    );
    const source = checkRes.rows[0];
    if (!source) {
      throw new AppError(404, "NOT_FOUND", "Source not found");
    }

    // 2. OCC Version check
    if (source.version !== input.expected_version) {
      throw new AppError(
        409,
        "VERSION_CONFLICT",
        `Stale version conflict. Current version is ${source.version}, but expected ${input.expected_version}. Please reload.`
      );
    }

    // 3. Atomic conditional update
    const updateRes = await client.query<SourceRow>(
      `UPDATE sources
       SET status = $1,
           version = version + 1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE workspace_id = $3 AND id = $4 AND version = $5
       RETURNING *`,
      [input.decision, reviewerId, workspaceId, sourceId, input.expected_version]
    );

    if (updateRes.rows.length === 0) {
      throw new AppError(409, "VERSION_CONFLICT", "Source version changed concurrently during review");
    }

    // Review bumps the version for OCC but does not change content. Re-point the
    // ingested chunks/facts, otherwise the approved version has no chunks and
    // knowledge contexts (and Research) would see an empty source.
    for (const table of ["source_chunks", "source_facts"]) {
      await client.query(
        `UPDATE ${table} SET source_version = $1 WHERE workspace_id = $2 AND source_id = $3 AND source_version = $4`,
        [updateRes.rows[0].version, workspaceId, sourceId, input.expected_version]
      );
    }

    // 4. Cascade invalidation if revoked
    if (input.decision === "revoked") {
      await invalidateApprovalsForTarget(workspaceId, "source", sourceId, "SOURCE_REVOKED", client);
    }

    return updateRes.rows[0];
  });
}
