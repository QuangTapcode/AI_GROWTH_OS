import { describe, expect, it } from 'vitest';
import { DbWorkflowStore } from '../src/workflow/DbWorkflowStore';
import { WorkflowRunner } from '../src/workflow/WorkflowRunner';
import { Pool } from 'pg';

/**
 * Test tích hợp DbWorkflowStore (MY-03 hoàn thiện) trên Postgres thật.
 * - Chạy khi có DATABASE_URL trỏ tới database test đã migrate.
 * - Không có cấu hình → explicit skip; cấu hình sai phải fail.
 */
const DATABASE_URL = process.env.DATABASE_URL;

describe('DbWorkflowStore — Postgres (MY-03)', () => {
  it.skipIf(!DATABASE_URL)('roundtrip workflow/task/dedup event trên DB thật', async () => {
    const store = new DbWorkflowStore(DATABASE_URL!);
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
      expect((await store.getWorkflow(wfId))?.workspace_id).toBe('ws-db-test');
      const probe = new Pool({ connectionString: DATABASE_URL });
      try {
        const rows = await probe.query(
          `SELECT workspace_id FROM workflow_tasks WHERE payload->>'workflow_id' = $1`, [wfId],
        );
        expect(rows.rows).toHaveLength(3);
        expect(new Set(rows.rows.map(row => row.workspace_id)).size).toBe(1);
      } finally { await probe.end(); }

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
