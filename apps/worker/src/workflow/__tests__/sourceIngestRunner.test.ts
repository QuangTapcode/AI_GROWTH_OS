import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { MAX_INGEST_ATTEMPTS, SourceIngestRunner } from '../SourceIngestRunner';
import type { AiAdapter } from '../../adapters/AiAdapter';

const source = {
  id: '11111111-1111-4111-8111-111111111111', workspace_id: '22222222-2222-4222-8222-222222222222', version: 1,
  url_or_blob: 'https://en.wikivoyage.org/wiki/Da_Nang', source_url: null, license: 'CC BY-SA 4.0',
  attribution: 'Wikivoyage contributors', ingest_attempts: 1, status: 'processing',
};
const output = {
  source_id: source.id, workspace_id: source.workspace_id, source_version: 1, url: source.url_or_blob,
  content_hash: 'a'.repeat(64), embedding_model: 'ollama/embeddinggemma:latest', embedding_input_format: 'embeddinggemma-prefix-v1',
  chunks: [{ chunk_index: 0, text_content: 'Coworking spaces in Da Nang.', citation_locator: 'paragraph:1', embedding: Array(768).fill(0.1), model: 'ollama/embeddinggemma:latest' }],
};

function harness(claimed: Record<string, unknown> | undefined, current = { version: 1, status: 'processing', deleted_at: null }) {
  const sql: { text: string; params: unknown[] }[] = [];
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    sql.push({ text, params });
    if (text.includes("SET status='processing'")) return { rows: claimed ? [claimed] : [] };
    if (text.includes('FOR UPDATE') && text.startsWith('SELECT version')) return { rows: [current] };
    return { rows: [] };
  });
  const release = vi.fn();
  const pool = { query, connect: async () => ({ query, release }) } as unknown as Pool;
  return { pool, sql, release };
}

const aiReturning = (out: unknown): AiAdapter => ({ run: vi.fn(async () => ({ output: out as Record<string, unknown>, model: 'ollama/embeddinggemma:latest', schema_version: '1.0.0' })) });

describe('SourceIngestRunner', () => {
  it('ingests one imported URL source with its license and moves it to needs_review', async () => {
    const { pool, sql, release } = harness(source);
    const ai = aiReturning(output);
    expect(await new SourceIngestRunner(pool, ai).runOnce()).toEqual({ source_id: source.id, status: 'needs_review', chunks: 1 });
    const request = (ai.run as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(request.aiOperation).toBe('knowledge.ingest');
    expect(request.input.source.provenance).toEqual({ license: 'CC BY-SA 4.0', attribution: 'Wikivoyage contributors', source_url: source.url_or_blob });
    const insert = sql.find((s) => s.text.includes('INSERT INTO source_chunks'))!;
    expect(insert.params[6]).toMatch(/^\[0\.1,/);
    expect(sql.find((s) => s.text.includes("status='needs_review'"))).toBeTruthy();
    expect(sql.some((s) => s.text === 'COMMIT')).toBe(true);
    expect(release).toHaveBeenCalledOnce();
  });

  it('approves a first-party TripC blog article right after ingest; other sources still wait for the owner', async () => {
    const blog = { ...source, url_or_blob: 'https://tripc.ai/blog/street-food-guide', license: 'TripC first-party content', attribution: 'TripC' };
    const { pool, sql } = harness(blog);
    const render = vi.fn(async () => '<html><body><article>Street food in Da Nang.</article></body></html>');
    expect(await new SourceIngestRunner(pool, aiReturning({ ...output, url: blog.url_or_blob }), render).runOnce())
      .toEqual({ source_id: blog.id, status: 'approved', chunks: 1 });
    expect(sql.find((s) => s.text.includes("status='approved'"))).toBeTruthy();
  });

  it('is idle when nothing is imported', async () => {
    const { pool } = harness(undefined);
    expect(await new SourceIngestRunner(pool, aiReturning(output)).runOnce()).toBeNull();
  });

  it('returns retryable AI failures to imported and keeps the error visible', async () => {
    const { pool, sql } = harness(source);
    const ai: AiAdapter = { run: vi.fn(async () => { throw Object.assign(new Error('ROBOTS_UNAVAILABLE'), { code: 'ROBOTS_UNAVAILABLE', permanent: false }); }) };
    expect(await new SourceIngestRunner(pool, ai).runOnce()).toMatchObject({ status: 'failed', error: 'ROBOTS_UNAVAILABLE', permanent: false });
    const update = sql.at(-1)!;
    expect(update.text).toContain("THEN 'imported'");
    expect(update.params).toEqual([source.id, 'ROBOTS_UNAVAILABLE', false, MAX_INGEST_ATTEMPTS]);
  });

  it('stops retrying permanent failures such as a robots.txt disallow', async () => {
    const { pool, sql } = harness(source);
    const ai: AiAdapter = { run: vi.fn(async () => { throw Object.assign(new Error('ROBOTS_DISALLOWED'), { code: 'ROBOTS_DISALLOWED', permanent: true }); }) };
    await new SourceIngestRunner(pool, ai).runOnce();
    expect(sql.at(-1)!.params).toEqual([source.id, 'ROBOTS_DISALLOWED', true, MAX_INGEST_ATTEMPTS]);
  });

  it('never calls AI for a source without reuse terms', async () => {
    const { pool } = harness({ ...source, license: null });
    const ai = aiReturning(output);
    expect(await new SourceIngestRunner(pool, ai).runOnce()).toMatchObject({ error: 'SOURCE_LICENSE_REQUIRED', permanent: true });
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('discards output for another source or a source changed during the fetch', async () => {
    const foreign = harness(source);
    expect(await new SourceIngestRunner(foreign.pool, aiReturning({ ...output, workspace_id: 'other' })).runOnce())
      .toMatchObject({ error: 'INGEST_SCOPE_MISMATCH' });
    const changed = harness(source, { version: 2, status: 'processing', deleted_at: null });
    expect(await new SourceIngestRunner(changed.pool, aiReturning(output)).runOnce()).toMatchObject({ error: 'SOURCE_CHANGED' });
    expect(changed.sql.some((s) => s.text === 'ROLLBACK')).toBe(true);
    expect(changed.sql.some((s) => s.text.includes('INSERT INTO source_chunks'))).toBe(false);
  });

  it('renders first-party SPA pages in a browser and sends the HTML to AI ingest', async () => {
    const spa = { ...source, url_or_blob: 'https://tripc.ai/blog/apartment-viewing-checklist-vietnam' };
    const { pool } = harness(spa);
    const ai = aiReturning({ ...output, url: spa.url_or_blob });
    const render = vi.fn(async () => '<main><p>Apartment viewing checklist.</p></main>');
    await new SourceIngestRunner(pool, ai, render).runOnce();
    expect(render).toHaveBeenCalledWith(spa.url_or_blob);
    expect((ai.run as ReturnType<typeof vi.fn>).mock.calls[0][0].input.source.html).toContain('Apartment viewing checklist');
  });

  it('does not open a browser for server-rendered sources', async () => {
    const { pool } = harness(source);
    const render = vi.fn();
    const ai = aiReturning(output);
    await new SourceIngestRunner(pool, ai, render).runOnce();
    expect(render).not.toHaveBeenCalled();
    expect((ai.run as ReturnType<typeof vi.fn>).mock.calls[0][0].input.source.html).toBeUndefined();
  });

  it('keeps a robots.txt disallow from the renderer as a permanent failure', async () => {
    const { pool, sql } = harness({ ...source, url_or_blob: 'https://tripc.ai/private' });
    const render = vi.fn(async () => { throw Object.assign(new Error('blocked'), { code: 'ROBOTS_DISALLOWED', permanent: true }); });
    const ai = aiReturning(output);
    expect(await new SourceIngestRunner(pool, ai, render).runOnce()).toMatchObject({ error: 'ROBOTS_DISALLOWED', permanent: true });
    expect(ai.run).not.toHaveBeenCalled();
    expect(sql.at(-1)!.params[2]).toBe(true);
  });

  it('uses a new AI job per claim so a re-fetch of the same version cannot collide', async () => {
    const first = harness({ ...source, updated_at: '2026-10-26T01:00:00Z' });
    const second = harness({ ...source, updated_at: '2026-10-26T02:00:00Z' });
    const ai1 = aiReturning(output), ai2 = aiReturning(output);
    await new SourceIngestRunner(first.pool, ai1).runOnce();
    await new SourceIngestRunner(second.pool, ai2).runOnce();
    const id = (ai: AiAdapter) => (ai.run as ReturnType<typeof vi.fn>).mock.calls[0][0].job_id;
    expect(id(ai1)).not.toBe(id(ai2));
  });
});
