import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { AiAdapter } from '../adapters/AiAdapter';
import { needsBrowser, renderWithBrowser, type RenderPage } from './BrowserRenderer';

export const MAX_INGEST_ATTEMPTS = 3;
const EMBEDDING_DIM = 768;

type IngestChunk = { chunk_index: number; text_content: string; citation_locator?: string | null; embedding?: number[]; model?: string };
type IngestOutput = {
  source_id: string; source_version: number; workspace_id: string; url: string; content_hash: string;
  embedding_model?: string; embedding_input_format?: string; chunks: IngestChunk[];
};

class IngestError extends Error {
  constructor(code: string, public permanent = true) { super(code); }
}

/** Stable UUID per source version and attempt, so an AI retry resumes instead of double-charging. */
function jobId(key: string): string {
  const h = createHash('sha256').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Fetches imported URL sources through AI `knowledge.ingest` (allowlist + robots.txt
 * enforced there), stores chunks/embeddings for that exact source version and moves
 * the source to `needs_review`. Nothing becomes searchable until the owner approves.
 */
export class SourceIngestRunner {
  constructor(private pool: Pool, private ai: AiAdapter, private render: RenderPage = renderWithBrowser) {}

  async runOnce() {
    // A worker killed mid-ingest leaves `processing`; hand it back after the lease expires.
    await this.pool.query(`UPDATE sources SET status='imported', updated_at=now()
      WHERE kind='url' AND status='processing' AND updated_at < now() - interval '15 minutes'`);
    const source = (await this.pool.query(`UPDATE sources SET status='processing', ingest_attempts=ingest_attempts+1, updated_at=now()
      WHERE id=(SELECT id FROM sources WHERE kind='url' AND status='imported' AND deleted_at IS NULL AND ingest_attempts < $1
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [MAX_INGEST_ATTEMPTS])).rows[0];
    if (!source) return null;
    try {
      if (!source.license || !source.attribution) throw new IngestError('SOURCE_LICENSE_REQUIRED');
      // Client-rendered first-party pages are rendered here; AI parses the HTML and re-checks the allowlist.
      const html = needsBrowser(source.url_or_blob) ? await this.render(source.url_or_blob) : undefined;
      const result = await this.ai.run({
        operation: 'ingest', aiOperation: 'knowledge.ingest',
        // One AI job per claim: a retry after a crash or a deliberate re-fetch of the same version
        // may carry different page content, which must not collide with an earlier run.
        job_id: jobId(`ingest:${source.id}:${source.version}:${source.ingest_attempts}:${new Date(source.updated_at ?? 0).toISOString()}`),
        workspace_id: source.workspace_id, input_version: source.version, trace_id: `source-ingest:${source.id}`,
        timeout_seconds: 300,
        input: { source: { source_id: source.id, version: source.version, workspace_id: source.workspace_id, kind: 'url',
          url: source.url_or_blob, ...(html ? { html } : {}), provenance: { license: source.license, attribution: source.attribution,
            source_url: source.source_url ?? source.url_or_blob } } },
      });
      const output = result.output as unknown as IngestOutput;
      if (output.source_id !== source.id || output.workspace_id !== source.workspace_id || output.source_version !== source.version)
        throw new IngestError('INGEST_SCOPE_MISMATCH');
      if (!output.chunks?.length) throw new IngestError('EMPTY_SOURCE');
      if (output.chunks.some((c) => c.embedding && c.embedding.length !== EMBEDDING_DIM)) throw new IngestError('EMBEDDING_DIM_MISMATCH');

      const db = await this.pool.connect();
      try {
        await db.query('BEGIN');
        const current = (await db.query('SELECT version, status, deleted_at FROM sources WHERE id=$1 FOR UPDATE', [source.id])).rows[0];
        // The owner may have deleted or re-versioned the source while the page was being fetched.
        if (!current || current.deleted_at || current.version !== source.version || current.status !== 'processing') throw new IngestError('SOURCE_CHANGED');
        await db.query('DELETE FROM source_chunks WHERE workspace_id=$1 AND source_id=$2 AND source_version=$3', [source.workspace_id, source.id, source.version]);
        for (const chunk of output.chunks) {
          await db.query(`INSERT INTO source_chunks (workspace_id, source_id, source_version, chunk_index, text_content, citation_locator,
              embedding, model, embedding_model, embedding_input_format)
            VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9, $10)`,
          [source.workspace_id, source.id, source.version, chunk.chunk_index, chunk.text_content, chunk.citation_locator ?? null,
            chunk.embedding ? `[${chunk.embedding.join(',')}]` : null, (chunk.model ?? result.model).slice(0, 50),
            (output.embedding_model ?? chunk.model ?? '').slice(0, 50) || null, output.embedding_input_format?.slice(0, 50) ?? null]);
        }
        await db.query(`UPDATE sources SET status='needs_review', content_hash=$2, source_url=$3, retrieved_at=now(),
            ingest_error=NULL, updated_at=now() WHERE id=$1`, [source.id, output.content_hash, output.url]);
        await db.query('COMMIT');
      } catch (error) { await db.query('ROLLBACK'); throw error; }
      finally { db.release(); }
      return { source_id: source.id, status: 'needs_review' as const, chunks: output.chunks.length };
    } catch (error) {
      const code = (error as { code?: string }).code ?? (error as Error).message;
      const permanent = error instanceof IngestError ? error.permanent : (error as { permanent?: boolean }).permanent === true;
      // Retryable failures go back to `imported` until the attempt cap; the last error stays visible.
      await this.pool.query(`UPDATE sources SET status=CASE WHEN status='processing' THEN 'imported' ELSE status END,
          ingest_attempts=CASE WHEN $3 THEN GREATEST(ingest_attempts, $4) ELSE ingest_attempts END, ingest_error=$2, updated_at=now()
        WHERE id=$1`, [source.id, String(code).slice(0, 500), permanent, MAX_INGEST_ATTEMPTS]);
      return { source_id: source.id, status: 'failed' as const, error: code, permanent };
    }
  }
}
