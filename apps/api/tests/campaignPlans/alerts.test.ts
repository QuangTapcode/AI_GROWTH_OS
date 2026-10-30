import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { workspaceAlerts } from '../../src/modules/campaignPlans/alerts';

const now = new Date('2026-10-30T10:00:00Z');

function pool(rows: { automation?: Record<string, unknown>; failures?: Record<string, number> } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM agent_automation')) return { rows: rows.automation ? [rows.automation] : [] };
    if (sql.includes('publishing_failed')) return { rows: [{ publishing_failed: 0, replies_failed: 0, tasks_failed: 0, ...rows.failures }] };
    return { rows: [] };
  });
  return { query } as unknown as Pool;
}

describe('workspace alerts', () => {
  it('reports a stopped worker when autopilot is on but the scheduler has not ticked for minutes', async () => {
    const alerts = await workspaceAlerts(pool({ automation: { enabled: true, last_tick_at: new Date('2026-10-30T09:50:00Z'), last_error: null } }), 'ws', now);
    expect(alerts.map((a) => a.code)).toEqual(['WORKER_NOT_RUNNING']);
    const healthy = await workspaceAlerts(pool({ automation: { enabled: true, last_tick_at: new Date('2026-10-30T09:59:30Z'), last_error: null } }), 'ws', now);
    expect(healthy).toEqual([]);
  });

  it('reports scheduler errors and failed publishing, replies and agent tasks of the last day', async () => {
    const alerts = await workspaceAlerts(pool({
      automation: { enabled: true, last_tick_at: new Date('2026-10-30T09:59:30Z'), last_error: 'DISCOVERY_FAILED: timeout' },
      failures: { publishing_failed: 2, replies_failed: 1, tasks_failed: 3 },
    }), 'ws', now);
    expect(alerts.map((a) => a.code)).toEqual(['SCHEDULER_ERROR', 'PUBLISHING_FAILED', 'REPLIES_FAILED', 'TASKS_FAILED']);
    expect(alerts[0].message).toContain('DISCOVERY_FAILED: timeout');
    expect(alerts[1].message).toContain('2');
  });
});
