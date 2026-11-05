import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { FirstPartyBlogSync } from '../FirstPartyBlogSync';

const ws = '22222222-2222-4222-8222-222222222222';

function harness(existing: string[], workspaces = [ws]) {
  const inserts: unknown[][] = [];
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    if (text.includes('SELECT DISTINCT workspace_id')) return { rows: workspaces.map((workspace_id) => ({ workspace_id })) };
    if (text.includes('SELECT url_or_blob FROM sources')) return { rows: existing.map((url_or_blob) => ({ url_or_blob })) };
    if (text.includes('INSERT INTO sources')) inserts.push(params);
    return { rows: [] };
  });
  return { pool: { query } as unknown as Pool, inserts };
}

describe('FirstPartyBlogSync', () => {
  it('imports only new articles of the blog into workspaces that already use it', async () => {
    const { pool, inserts } = harness(['https://tripc.ai/blog/apartment-viewing-checklist-vietnam']);
    const listLinks = vi.fn(async () => [
      { url: 'https://tripc.ai/blog/apartment-viewing-checklist-vietnam', title: 'Apartment Viewing Checklist' },
      { url: 'https://tripc.ai/blog/street-food-da-nang', title: 'Street Food in Da Nang' },
      { url: 'https://other.example/blog/copied-post', title: 'Elsewhere' },
      { url: 'https://tripc.ai/blog', title: 'All articles' },
    ]);
    expect(await new FirstPartyBlogSync(pool, listLinks).runOnce()).toMatchObject({ imported: 1 });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual(expect.arrayContaining([ws, 'https://tripc.ai/blog/street-food-da-nang', 'Street Food in Da Nang (tripc.ai)']));
  });

  it('gives articles still on the blog a fresh try after their render failed', async () => {
    // Real run: seven published articles stayed unimported after three quick failed renders.
    const listed = 'https://tripc.ai/blog/official-vietnam-evisa-website';
    const { pool } = harness([listed]);
    const retried = vi.mocked(pool.query);
    retried.mockImplementationOnce(async () => ({ rows: [{ workspace_id: ws }] }) as never);
    const listLinks = vi.fn(async () => [{ url: listed, title: 'Official e-visa website' }]);
    await new FirstPartyBlogSync(pool, listLinks).runOnce();
    const retry = retried.mock.calls.find(([sql]) => String(sql).includes('ingest_attempts=0'));
    expect(retry?.[0]).toContain("status='imported'");
    expect(retry?.[1]).toEqual([ws, [listed]]);
  });

  it('does not browse the blog when no workspace uses it', async () => {
    const { pool } = harness([], []);
    const listLinks = vi.fn();
    expect(await new FirstPartyBlogSync(pool, listLinks).runOnce()).toMatchObject({ imported: 0 });
    expect(listLinks).not.toHaveBeenCalled();
  });
});
