import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { DbWorkflowStore } from '../src/workflow/DbWorkflowStore';
import { WorkflowRunner } from '../src/workflow/WorkflowRunner';
import { PublishJobProcessor } from '../src/publish/PublishJobProcessor';
import { PublisherRegistry } from '../src/publish/CmsPublisher';

/**
 * MY-08 drill — MỘT PHẦN chạy trên hạ tầng thật (Postgres), phần còn lại
 * (kill process + CMS timeout thật) chờ TH-07 E2E env:
 * 1. Queue backlog: worker "chết" giữa chừng → worker mới drain backlog từ PG.
 * 2. Revoked connector: gateway deny → publish fail fast GATEWAY_DENIED, không retry.
 *
 * Gating như dbWorkflow.test.ts: không có DATABASE_URL → skip.
 */
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://ai_growth_dev:ai_growth_dev@localhost:15432/ai_growth_os';

async function tryConnect(): Promise<Pool | null> {
  const pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 4000 });
  try {
    await pool.query('SELECT 1');
    return pool;
  } catch {
    await pool.end().catch(() => undefined);
    return null;
  }
}

describe('MY-08 drill — queue backlog trên PG thật', () => {
  it('worker mới drain backlog của worker chết giữa chừng (PG durable)', async () => {
    const pool = await tryConnect();
    if (!pool) {
      console.warn('SKIP my08DrillPg: no Postgres at ' + DATABASE_URL);
      return;
    }
    const store = new DbWorkflowStore(DATABASE_URL);
    try {
      const wfId = `wf-backlog-${Date.now()}`;
      const runner1 = new WorkflowRunner({
        store,
        execute: async (task) => ({ output_artifact_ref: `artifact://${task.id}` }),
      });
      await runner1.createWorkflow({
        id: wfId,
        workspace_id: 'ws-my08',
        tasks: [
          { id: `t1-${wfId}`, operation: 'research' },
          { id: `t2-${wfId}`, operation: 'content', depends_on: [`t1-${wfId}`] },
          { id: `t3-${wfId}`, operation: 'content', depends_on: [`t2-${wfId}`], requires_approval: true },
        ],
      });

      // Worker 1 chạy tới bước chờ approval rồi "chết" (không dispatch tiếp).
      const first = await runner1.dispatch(wfId);
      expect(first.completed.length).toBe(2); // t1 + t2
      expect(first.waiting).toEqual([`t3-${wfId}`]); // t3 awaiting_approval

      // Worker mới (process khác) trên cùng PG: resume tới backlog cuối.
      const runner2 = new WorkflowRunner({
        store,
        execute: async (task) => ({ output_artifact_ref: `artifact://${task.id}` }),
      });
      await runner2.resume(wfId);

      const tasks = await store.listTasks(wfId);
      const byId = new Map(tasks.map((t) => [t.id, t]));
      expect(byId.get(`t1-${wfId}`)?.state).toBe('completed');
      expect(byId.get(`t2-${wfId}`)?.state).toBe('completed');
      // Task cuối chờ approval — backlog đã drain tới bước approvals.
      expect(byId.get(`t3-${wfId}`)?.state).toBe('awaiting_approval');

      // Event log bền qua restart (exactly-once nhờ dedup_key).
      const applied1 = await store.appendEvent({
        id: `ev-a-${wfId}`,
        workflow_id: wfId,
        task_id: null,
        type: 'approval_granted',
        dedup_key: 'my08-drill',
        payload: {},
        created_at: new Date(),
      });
      const applied2 = await store.appendEvent({
        id: `ev-b-${wfId}`,
        workflow_id: wfId,
        task_id: null,
        type: 'approval_granted',
        dedup_key: 'my08-drill',
        payload: {},
        created_at: new Date(),
      });
      expect(applied1.applied).toBe(true);
      expect(applied2.applied).toBe(false); // duplicate bị suppress
    } finally {
      await store.destroy();
      await pool.end();
    }
  });
});

describe('MY-08 drill — revoked connector (fail fast)', () => {
  it('gateway deny → GATEWAY_DENIED fail fast, không gọi CMS, không retry', async () => {
    let cmsCalls = 0;
    const registry = new PublisherRegistry();
    registry.register('Website', {
      channel: 'Website',
      publish: async () => {
        cmsCalls += 1;
        return { success: true };
      },
      reconcile: async () => ({ success: false }),
    });
    const spyProcessor = new PublishJobProcessor(registry);

    const result = await spyProcessor.publish({
      jobId: 'job-revoked',
      workspaceId: 'ws-1',
      contentId: 'c-1',
      channel: 'Website',
      scheduledAt: new Date(),
      idempotencyKey: 'publish:ws-1:c-1:Website:1',
      bodyMarkdown: '# post',
      expectedVersion: 1,
      contentHash: 'hash',
      approvalId: 'appr-revoked',
      gatewayCheck: async () => ({
        authorized: false,
        denialReason: 'APPROVAL_NOT_GRANTED: approval revoked',
      }),
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('GATEWAY_DENIED');
    expect(result.errorMessage).toContain('revoked');
    expect(cmsCalls).toBe(0); // fail fast trước khi đụng CMS
  });
});
