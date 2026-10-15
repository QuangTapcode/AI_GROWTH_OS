import { describe, expect, it } from 'vitest';
import { DbWorkflowStore } from '../src/workflow/DbWorkflowStore';
import { WorkflowRunner } from '../src/workflow/WorkflowRunner';

/**
 * Test tích hợp DbWorkflowStore (MY-03 hoàn thiện) trên Postgres thật.
 * - Chạy khi có DATABASE_URL (mặc định infra local:
 *   postgres://postgres:postgres@localhost:15432/ai_growth_os).
 * - Không có DB → skip, không fail CI local.
 */
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://postgres:postgres@localhost:15432/ai_growth_os';

async function canConnect(): Promise<boolean> {
  try {
    const probe = new DbWorkflowStore(DATABASE_URL);
    await probe.getWorkflow('__probe__');
    await probe.destroy();
    return true;
  } catch {
    return false;
  }
}

describe('DbWorkflowStore — Postgres (MY-03)', () => {
  it('roundtrip workflow/task/dedup event trên DB thật', async () => {
    if (!(await canConnect())) {
      console.warn('SKIP dbWorkflow.test: no Postgres at ' + DATABASE_URL);
      return;
    }
    const store = new DbWorkflowStore(DATABASE_URL);
    try {
      const runner = new WorkflowRunner({
        store,
        execute: async (task) => ({
          output_artifact_ref: `artifact://${task.id}`,
        }),
      });
      const wfId = `wf-db-${Date.now()}`;
      const wf = await runner.createWorkflow({
        id: wfId,
        workspace_id: 'ws-db-test',
        tasks: [
          { id: `r-${wfId}`, operation: 'research' },
          {
            id: `c-${wfId}`,
            operation: 'content',
            depends_on: [`r-${wfId}`],
            requires_approval: true,
          },
        ],
      });
      expect(wf.id).toBe(wfId);

      const first = await runner.dispatch(wfId);
      expect(first.waiting.length).toBe(1);

      // Restart runner trên cùng DB — state phải bền.
      const runner2 = new WorkflowRunner({
        store,
        execute: async (task) => ({
          output_artifact_ref: `artifact://${task.id}`,
        }),
      });
      await runner2.resume(wfId);
      const tasks = await store.listTasks(wfId);
      expect(tasks.length).toBe(2);
      expect(
        tasks.find((t) => t.id === `c-${wfId}`)?.state,
      ).toBe('awaiting_approval');

      // Event idempotency ở tầng DB.
      await store.appendEvent({
        id: `ev-1-${wfId}`,
        workflow_id: wfId,
        task_id: null,
        type: 'approval_granted',
        dedup_key: 'resume-1',
        payload: {},
        created_at: new Date(),
      });
      const dup = await store.appendEvent({
        id: `ev-1b-${wfId}`,
        workflow_id: wfId,
        task_id: null,
        type: 'approval_granted',
        dedup_key: 'resume-1',
        payload: {},
        created_at: new Date(),
      });
      expect(dup.applied).toBe(false);
      const events = await store.listEvents(wfId);
      expect(events.length).toBe(1);

      await store.updateWorkflow(wfId, { state: 'cancelled' });
    } finally {
      await store.destroy();
    }
  });
});
