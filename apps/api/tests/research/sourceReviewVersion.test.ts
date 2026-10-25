import { describe, expect, it, vi } from 'vitest';

const statements: { sql: string; params: unknown[] }[] = [];
vi.mock('../../src/lib/db', () => ({
  query: vi.fn(),
  withTransaction: async (fn: (client: unknown) => unknown) => fn({
    query: async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (sql.includes('FOR UPDATE')) return { rows: [{ id: 'src', version: 1, status: 'needs_review' }] };
      if (sql.includes('UPDATE sources')) return { rows: [{ id: 'src', version: 2, status: 'approved' }] };
      return { rows: [], rowCount: 1 };
    },
  }),
}));

describe('source review', () => {
  it('re-points ingested chunks and facts to the approved version', async () => {
    const { executeSourceReviewTransaction } = await import('../../src/modules/sources/repository');
    await executeSourceReviewTransaction('ws', 'src', { decision: 'approved', expected_version: 1 }, 'owner');
    const repoint = statements.filter((s) => /UPDATE source_(chunks|facts) SET source_version/.test(s.sql));
    expect(repoint.map((s) => s.sql.split(' ')[1])).toEqual(['source_chunks', 'source_facts']);
    expect(repoint.every((s) => JSON.stringify(s.params) === JSON.stringify([2, 'ws', 'src', 1]))).toBe(true);
  });
});
