import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { canonicalJson, sha256Hex } from '../../src/lib/hash';
import { isInternal, siteEventSchema } from '../../src/modules/site/events';
import { ensureMeasurementArtifacts } from '../../src/modules/site/measurement';
import { publishSeoArtifact, slugify } from '../../src/modules/site/publish';

const WS = '10000000-0000-4000-8000-000000000001';

describe('site publishing', () => {
  it('builds readable ASCII slugs', () => {
    expect(slugify('Flexible Workspaces for Expats: Adapting to Daily Needs')).toBe('flexible-workspaces-for-expats-adapting-to-daily-needs');
    expect(slugify('Đà Nẵng housing — 2026 guide')).toBe('da-nang-housing-2026-guide');
    expect(slugify('!!!')).toBe('post');
  });

  const pool = (artifact: Record<string, unknown> | undefined, approved: boolean) => ({
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM content_artifacts')) return { rows: artifact ? [artifact] : [], rowCount: artifact ? 1 : 0 };
      if (sql.includes('FROM approvals')) return { rows: [], rowCount: approved ? 1 : 0 };
      if (sql.includes('SELECT id, slug FROM contents')) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT 1 FROM contents')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO contents')) return { rows: [{ id: 'content-1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
  }) as unknown as Pool;
  const seo = (result: Record<string, unknown>) => ({ id: 'a1', version: 4, content_hash: 'h', context_snapshot_id: 'c', role: 'seo',
    payload: { result: { title: 'Working from home in Da Nang', body_markdown: '## A\n\nB', meta_description: 'M', status: 'draft', missing_facts: [], synthetic: false, ...result } } });

  it('publishes only an approved, complete, real SEO article', async () => {
    await expect(publishSeoArtifact(pool(seo({}), true), WS, 'a1', 'owner')).resolves.toMatchObject({ slug: 'working-from-home-in-da-nang', published: true });
    await expect(publishSeoArtifact(pool(seo({}), false), WS, 'a1', 'owner')).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    await expect(publishSeoArtifact(pool(seo({ synthetic: true }), true), WS, 'a1', 'owner')).rejects.toMatchObject({ code: 'SYNTHETIC_NOT_PUBLISHABLE' });
    await expect(publishSeoArtifact(pool(seo({ missing_facts: ['x'] }), true), WS, 'a1', 'owner')).rejects.toMatchObject({ code: 'ARTICLE_NOT_READY' });
    await expect(publishSeoArtifact(pool({ ...seo({}), role: 'content' }, true), WS, 'a1', 'owner')).rejects.toMatchObject({ code: 'ARTIFACT_NOT_SEO' });
  });
});

describe('site events', () => {
  it('treats loopback, private and missing client addresses as internal', () => {
    expect(isInternal(null, null)).toBe(true);
    expect(isInternal('127.0.0.1', null)).toBe(true);
    expect(isInternal('192.168.1.20, 10.0.0.1', null)).toBe(true);
    expect(isInternal('203.0.113.9, 10.0.0.1', null)).toBe(false);
    expect(isInternal(null, '198.51.100.4')).toBe(false);
  });

  it('accepts only anonymous, bounded events', () => {
    const ok = { event_type: 'page_view', session_id: 'a'.repeat(24), path: '/posts/x', content_slug: 'x' };
    expect(siteEventSchema.safeParse(ok).success).toBe(true);
    expect(siteEventSchema.safeParse({ ...ok, email: 'a@b.c' }).success).toBe(false);
    expect(siteEventSchema.safeParse({ ...ok, session_id: 'short' }).success).toBe(false);
    expect(siteEventSchema.safeParse({ ...ok, event_type: 'purchase' }).success).toBe(false);
  });
});

describe('first-party measurement', () => {
  it('stores hash-verifiable ledger artifacts and declares search metrics unavailable', async () => {
    const inserts: unknown[][] = [];
    const pool = { query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("operation IN ('metrics.snapshot','lead.aggregate')")) return { rows: [] };
      if (sql.includes('qualified_visits')) return { rows: [{ qualified_visits: 0, page_views: 0, internal_page_views: 3, leads: 0 }] };
      if (sql.includes('INSERT INTO content_artifacts')) inserts.push(params);
      return { rows: [] };
    }) } as unknown as Pool;
    const out = await ensureMeasurementArtifacts(pool, WS, 'ctx-1', 24);
    expect(out.created).toBe(true);
    expect(inserts).toHaveLength(2);
    const metrics = JSON.parse(inserts[0][6] as string);
    expect(metrics.result).toMatchObject({ qualified_visits: 0, leads: 0, impressions: null, clicks: null, synthetic: false, source: 'first_party',
      unavailable: { impressions: 'search_console_not_connected', clicks: 'search_console_not_connected' } });
    expect(metrics.artifact).toMatchObject({ role: 'performance', storage: 'postgres_ledger', context_snapshot_id: 'ctx-1', version: 1 });
    expect(metrics.artifact.content_hash).toBe(sha256Hex(canonicalJson({ result: metrics.result, evidence: [] })));
    expect(metrics.measurement.internal_page_views).toBe(3);
    const leads = JSON.parse(inserts[1][6] as string);
    expect(Object.keys(leads.result).sort()).toEqual(['count', 'synthetic', 'version', 'workspace_id']);
  });
});
