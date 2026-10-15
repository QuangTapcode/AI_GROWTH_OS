/**
 * Module RAG Persistence (W1-TQ-06)
 * Lưu trữ Vector Chunks và Facts trích xuất từ tài liệu đã được duyệt.
 * Đảm bảo:
 * - Tenant Isolation (chỉ lưu đúng workspace của source)
 * - Optimistic Concurrency Control (kiểm tra source_version, reject 409 Conflict nếu stale version)
 * - Idempotency (xóa chunk cũ của cùng version trước khi ghi mới trong transaction)
 */

import { z } from "zod";
import pool, { withTransaction } from "@/lib/db";
import { NotFoundError, ConflictError, ValidationError } from "@/lib/errors";
import { requireWorkspaceAccess } from "@/lib/tenant";
import { AuthenticatedUser } from "@/lib/auth";

export const ragChunkInputSchema = z.object({
  chunk_index: z.number().int().nonnegative(),
  text_content: z.string().min(1),
  citation_locator: z.string().optional(),
  embedding: z.array(z.number()).length(768).optional(), // 768 dimensions for embeddinggemma
  model: z.string().default("embeddinggemma"),
});

export const ragFactInputSchema = z.object({
  fact_key: z.string().min(1).max(100),
  fact_value: z.string().min(1),
  unit: z.string().max(50).optional(),
  verification_status: z
    .enum(["unverified", "verified", "disputed"])
    .default("unverified"),
  valid_until: z.string().datetime().optional(),
});

export const persistRagPayloadSchema = z.object({
  source_version: z.number().int().positive(),
  content_hash: z.string().max(64).optional(),
  provenance: z
    .object({
      license: z.string().optional(),
      attribution: z.string().optional(),
      source_url: z.string().optional(),
      upstream_version: z.string().optional(),
      retrieved_at: z.string().datetime().optional(),
    })
    .optional(),
  chunks: z.array(ragChunkInputSchema).min(1),
  facts: z.array(ragFactInputSchema).optional(),
});

export type PersistRagPayload = z.infer<typeof persistRagPayloadSchema>;

/**
 * Lưu trữ RAG Chunks và Facts vào CSDL
 */
export async function persistSourceRagData(
  user: AuthenticatedUser,
  workspaceId: string,
  sourceId: string,
  rawPayload: unknown
) {
  // 1. Phân quyền: Chỉ Owner hoặc Editor mới có quyền nạp RAG data
  await requireWorkspaceAccess(workspaceId, user.id, ["owner", "editor"]);

  // 2. Validate payload
  const parsed = persistRagPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid RAG payload: " + parsed.error.issues.map((i) => i.message).join(", ")
    );
  }
  const payload = parsed.data;

  // 3. Thực thi trong Transaction an toàn
  return withTransaction(async (client) => {
    // Khóa dòng source để kiểm tra concurrency
    const checkRes = await client.query(
      `SELECT id, workspace_id, version, status, deleted_at 
       FROM sources 
       WHERE id = $1 AND workspace_id = $2 
       FOR UPDATE`,
      [sourceId, workspaceId]
    );

    if (checkRes.rows.length === 0 || checkRes.rows[0].deleted_at !== null) {
      throw new NotFoundError("Source not found or has been deleted.");
    }

    const currentSource = checkRes.rows[0];

    // Kiểm tra Stale Version: Nếu version trong DB khác version AI gửi về $\rightarrow$ 409 Conflict
    if (currentSource.version !== payload.source_version) {
      throw new ConflictError(
        `Stale RAG version conflict. Source current version is ${currentSource.version}, but incoming data is for version ${payload.source_version}. Discarded.`
      );
    }

    // Xóa các chunk và facts cũ của đúng version này (nếu có) để đảm bảo tính Idempotent khi retry
    await client.query(
      `DELETE FROM source_chunks 
       WHERE workspace_id = $1 AND source_id = $2 AND source_version = $3`,
      [workspaceId, sourceId, payload.source_version]
    );

    await client.query(
      `DELETE FROM source_facts 
       WHERE workspace_id = $1 AND source_id = $2 AND source_version = $3`,
      [workspaceId, sourceId, payload.source_version]
    );

    // Chèn từng chunk vào bảng source_chunks (với vector 768)
    for (const chunk of payload.chunks) {
      const vectorLiteral = chunk.embedding ? `[${chunk.embedding.join(",")}]` : null;

      await client.query(
        `INSERT INTO source_chunks 
          (workspace_id, source_id, source_version, chunk_index, text_content, citation_locator, embedding, model)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8)`,
        [
          workspaceId,
          sourceId,
          payload.source_version,
          chunk.chunk_index,
          chunk.text_content,
          chunk.citation_locator || null,
          vectorLiteral,
          chunk.model,
        ]
      );
    }

    // Chèn facts vào bảng source_facts (nếu có)
    if (payload.facts && payload.facts.length > 0) {
      for (const fact of payload.facts) {
        await client.query(
          `INSERT INTO source_facts 
            (workspace_id, source_id, source_version, fact_key, fact_value, unit, verification_status, valid_until)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            workspaceId,
            sourceId,
            payload.source_version,
            fact.fact_key,
            fact.fact_value,
            fact.unit || null,
            fact.verification_status,
            fact.valid_until || null,
          ]
        );
      }
    }

    // Cập nhật thông tin provenance và content_hash vào bảng sources
    if (payload.content_hash || payload.provenance) {
      await client.query(
        `UPDATE sources 
         SET content_hash = COALESCE($1, content_hash),
             license = COALESCE($2, license),
             attribution = COALESCE($3, attribution),
             source_url = COALESCE($4, source_url),
             upstream_version = COALESCE($5, upstream_version),
             retrieved_at = COALESCE($6, retrieved_at),
             updated_at = NOW()
         WHERE id = $7 AND workspace_id = $8`,
        [
          payload.content_hash || null,
          payload.provenance?.license || null,
          payload.provenance?.attribution || null,
          payload.provenance?.source_url || null,
          payload.provenance?.upstream_version || null,
          payload.provenance?.retrieved_at || null,
          sourceId,
          workspaceId,
        ]
      );
    }

    return {
      success: true,
      workspace_id: workspaceId,
      source_id: sourceId,
      source_version: payload.source_version,
      chunks_persisted: payload.chunks.length,
      facts_persisted: payload.facts?.length || 0,
      timestamp: new Date().toISOString(),
    };
  });
}

/**
 * Lấy danh sách chunks và facts đã persist của 1 source
 */
export async function getSourceRagData(
  user: AuthenticatedUser,
  workspaceId: string,
  sourceId: string
) {
  await requireWorkspaceAccess(workspaceId, user.id, ["owner", "editor", "viewer"]);

  const chunksRes = await pool.query(
    `SELECT id, chunk_index, text_content, citation_locator, model, source_version, created_at 
     FROM source_chunks 
     WHERE workspace_id = $1 AND source_id = $2 
     ORDER BY chunk_index ASC`,
    [workspaceId, sourceId]
  );

  const factsRes = await pool.query(
    `SELECT id, fact_key, fact_value, unit, verification_status, valid_until, source_version, created_at 
     FROM source_facts 
     WHERE workspace_id = $1 AND source_id = $2 
     ORDER BY created_at ASC`,
    [workspaceId, sourceId]
  );

  return {
    workspace_id: workspaceId,
    source_id: sourceId,
    chunks: chunksRes.rows,
    facts: factsRes.rows,
  };
}
