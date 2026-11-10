import { describe, expect, it, vi, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.mock('../../src/lib/db', () => ({ query: vi.fn(async () => ({ rows: [] })), default: {}, withTransaction: vi.fn() }));
vi.mock('../../src/lib/public-service', async () => {
  const { InMemoryLeadRepository } = await import('../../src/modules/leads/repository');
  return { globalLeadRepo: new InMemoryLeadRepository() };
});
import { globalLeadRepo } from '../../src/lib/public-service';
import { getWorkspaceReport, recordMetricSnapshot, memorySnapshots } from '../../src/modules/reports/service';
import { reportQuerySchema } from '../../src/modules/reports/schemas';
import { dailySnapshots } from '../../src/modules/metrics/service';
import { query } from '../../src/lib/db';
import type { LeadRecord } from '../../src/modules/leads/repository';
import { ensureMeasurementArtifacts, baselineMetricArtifact } from '../../src/modules/site/measurement';
import type { Pool } from 'pg';

afterEach(() => { memorySnapshots.clear(); vi.restoreAllMocks(); });

async function lead(workspace: string, at: string, synthetic = false) {
  await globalLeadRepo.withTransaction(async tx => tx.insertLead({ id: randomUUID(), workspace_id: workspace,
    site_id: 'test', captured_at: new Date(at), context: { synthetic } } as unknown as LeadRecord));
}

describe('Performance data integrity', () => {
  it('counts more than 100 historical leads, excludes synthetic/other tenants, and respects local midnight', async () => {
    const ws = randomUUID();
    for (let i = 0; i < 150; i++) await lead(ws, '2026-10-01T17:01:00Z');
    await lead(ws, '2026-10-02T16:59:59Z');
    await lead(ws, '2026-10-02T17:00:00Z'); // following local date
    await lead(ws, '2026-10-01T16:59:59Z'); // previous local date
    await lead(ws, '2026-10-02T00:00:00Z', true);
    await lead(randomUUID(), '2026-10-02T00:00:00Z');
    for (let i = 0; i < 120; i++) await lead(ws, '2026-11-01T00:00:00Z');
    const report = await getWorkspaceReport(ws, { from: '2026-10-02', to: '2026-10-02' });
    expect(report.summary.total_leads).toBe(151);
    expect(report.kpis.leads_generated.value).toBe(151);
  });

  it('rejects invalid dates, timezone and reversed/unbounded periods', async () => {
    expect(reportQuerySchema.safeParse({ timezone: 'Asia/Bang_Chi_Minh' }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ from: '2026-02-30' }).success).toBe(false);
    await expect(getWorkspaceReport(randomUUID(), { from: '2026-10-02', to: '2026-10-01' })).rejects.toMatchObject({ statusCode: 422 });
  });

  it('never relabels VND spend as USD or accepts a snapshot from another timezone', async () => {
    const ws = randomUUID();
    recordMetricSnapshot({ workspace_id: ws, provider: 'meta_ads', metric_name: 'ad_spend', period_from: '2026-10-02',
      period_to: '2026-10-02', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND', metric_value: 100000, availability: 'available', missing_reason: null });
    const report = await getWorkspaceReport(ws, { from: '2026-10-02', to: '2026-10-02', currency: 'USD' });
    expect(report.kpis.ad_spend).toMatchObject({ value: null, availability: 'missing', missing_reason: 'CURRENCY_MISMATCH' });
  });

  it('returns cached current and its paired lead aggregate even when baseline was created later', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [
      { id: 'current', operation: 'metrics.snapshot', result: { window_end: '2026-10-08' } },
      { id: 'baseline', operation: 'metrics.snapshot', result: { window_end: '2026-10-01' } },
      { id: 'unrelated', operation: 'lead.aggregate', result: { metrics_artifact_id: 'baseline' } },
      { id: 'paired', operation: 'lead.aggregate', result: { metrics_artifact_id: 'current' } },
    ] })) } as unknown as Pool;
    expect(await ensureMeasurementArtifacts(pool, randomUUID(), randomUUID())).toMatchObject({ metrics_artifact_id: 'current', lead_aggregate_id: 'paired', created: false });
    expect(vi.mocked(pool.query).mock.calls[0][0]).toContain("window_end");
    await baselineMetricArtifact(pool, randomUUID(), randomUUID(), 'current');
    expect(vi.mocked(pool.query).mock.calls[1][0]).toContain("window_end')::timestamptz DESC");
  });

  it('retains source timezone and currency in daily data', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ date: '2026-10-02', metric_value: '9', availability: 'available', missing_reason: null,
      timezone: 'UTC', currency: 'USD', provider: 'meta_ads' }] } as never);
    expect(await dailySnapshots(randomUUID(), 'ad_spend', '2026-10-02', '2026-10-02')).toMatchObject([{ value: 9, timezone: 'UTC', currency: 'USD' }]);
  });
});
