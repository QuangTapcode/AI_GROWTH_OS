import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { WorkflowRunner } from '../src/workflow/WorkflowRunner';
import { MemoryWorkflowStore, FileWorkflowStore } from '../src/workflow/WorkflowStore';

/** Campaign mẫu: research → seo (cần approve) → publish → report. */
function campaignSpec(requiresApproval = true) {
  return [
    { id: 't-research', operation: 'research' as const },
    { id: 't-seo', operation: 'content' as const, depends_on: ['t-research'], requires_approval: requiresApproval },
    { id: 't-publish', operation: 'publish' as const, depends_on: ['t-seo'] },
    { id: 't-report', operation: 'metrics' as const, depends_on: ['t-publish'] },
  ];
}

function okExecutor() {
  return async (task: { id: string }) => ({ output_artifact_ref: `artifact://${task.id}` });
}

describe('WorkflowRunner — dependency dispatch (MY-03)', () => {
  it('reject DAG có cycle hoặc dependency lạ', async () => {
    const runner = new WorkflowRunner({ store: new MemoryWorkflowStore(), execute: okExecutor() });
    await expect(
      runner.createWorkflow({
        workspace_id: 'ws-1',
        tasks: [
          { id: 'a', operation: 'research', depends_on: ['b'] },
          { id: 'b', operation: 'content', depends_on: ['a'] },
        ],
      }),
    ).rejects.toThrow('DEPENDENCY_CYCLE');
    await expect(
      runner.createWorkflow({
        workspace_id: 'ws-1',
        tasks: [{ id: 'a', operation: 'research', depends_on: ['ghost'] }],
      }),
    ).rejects.toThrow('UNKNOWN_DEPENDENCY');
  });

  it('dispatch đúng thứ tự DAG, dừng ở human wait và tiếp tục sau approval', async () => {
    const store = new MemoryWorkflowStore();
    const executed: string[] = [];
    const runner = new WorkflowRunner({
      store,
      execute: async (task) => {
        executed.push(task.id);
        return { output_artifact_ref: `artifact://${task.id}` };
      },
    });
    const wf = await runner.createWorkflow({ workspace_id: 'ws-1', tasks: campaignSpec() });

    const first = await runner.dispatch(wf.id);
    // research chạy, seo chạy rồi chờ approve; publish/report chưa được đụng.
    expect(executed).toEqual(['t-research', 't-seo']);
    expect(first.waiting).toEqual(['t-seo']);
    expect(executed).not.toContain('t-publish');

    const seo = await store.getTask('t-seo');
    expect(seo!.state).toBe('awaiting_approval');
    expect(seo!.output_artifact_ref).toBe('artifact://t-seo');
    const wfState = await store.getWorkflow(wf.id);
    expect(wfState!.state).toBe('awaiting_approval');

    // Duplicate approval event không apply lần hai (dedup).
    const dup = await runner.applyEvent({
      workflow_id: wf.id,
      task_id: 't-seo',
      type: 'approval_granted',
      dedup_key: 'approval:t-seo:v1',
    });
    expect(dup.applied).toBe(true);
    const dupAgain = await runner.applyEvent({
      workflow_id: wf.id,
      task_id: 't-seo',
      type: 'approval_granted',
      dedup_key: 'approval:t-seo:v1',
    });
    expect(dupAgain).toMatchObject({ applied: false, reason: 'DUPLICATE_EVENT' });

    const second = await runner.dispatch(wf.id);
    expect(executed).toEqual(['t-research', 't-seo', 't-publish', 't-report']);
    expect(second.workflow_completed).toBe(true);
    expect((await store.getWorkflow(wf.id))!.state).toBe('completed');
    expect((await store.getTask('t-report'))!.output_artifact_ref).toBe('artifact://t-report');
  });

  it('approval_rejected → task về queued để rework, không tăng attempt', async () => {
    const store = new MemoryWorkflowStore();
    const runner = new WorkflowRunner({ store, execute: okExecutor() });
    const wf = await runner.createWorkflow({ workspace_id: 'ws-1', tasks: campaignSpec() });
    await runner.dispatch(wf.id);
    expect((await store.getTask('t-seo'))!.state).toBe('awaiting_approval');

    await runner.applyEvent({
      workflow_id: wf.id,
      task_id: 't-seo',
      type: 'approval_rejected',
      dedup_key: 'reject:t-seo:round-1',
    });
    const seo = await store.getTask('t-seo');
    expect(seo!.state).toBe('queued');
    expect(seo!.error_code).toBe('APPROVAL_REJECTED');
    expect(seo!.attempt).toBe(1); // attempt của lần chạy trước, rejection không cộng thêm
  });

  it('task fail quá max_attempts → failed, downstream blocked, không chạy lại campaign', async () => {
    const store = new MemoryWorkflowStore();
    const executed: string[] = [];
    let failPublish = true;
    const runner = new WorkflowRunner({
      store,
      execute: async (task) => {
        executed.push(task.id);
        if (task.id === 't-publish' && failPublish) {
          const err = new Error('CMS timeout') as Error & { code: string };
          err.code = 'PUBLISH_TIMEOUT';
          throw err;
        }
        return { output_artifact_ref: `artifact://${task.id}` };
      },
    });
    const wf = await runner.createWorkflow({ workspace_id: 'ws-1', tasks: campaignSpec(false) });

    const first = await runner.dispatch(wf.id);
    expect(first.retrying).toEqual(['t-publish']);

    // Attempt 2 vẫn fail.
    const second = await runner.dispatch(wf.id);
    expect(second.retrying).toEqual(['t-publish']);

    // Attempt 3 fail → failed quá max_attempts=3.
    const third = await runner.dispatch(wf.id);
    expect(third.failed).toEqual(['t-publish']);
    expect((await store.getTask('t-publish'))!.error_code).toBe('PUBLISH_TIMEOUT');

    // Downstream blocked, report KHÔNG được chạy.
    expect(executed).not.toContain('t-report');
    const report = await store.getTask('t-report');
    expect(report!.state).toBe('blocked');
    expect(report!.error_code).toBe('DEPENDENCY_FAILED');
    expect((await store.getWorkflow(wf.id))!.state).toBe('blocked');

    // Sửa CMS xong → requeue step lỗi, dispatch chạy tiếp publish→report;
    // research/seo đã completed KHÔNG chạy lại.
    failPublish = false;
    await runner.requeueFailed(wf.id, 't-publish');
    const fourth = await runner.dispatch(wf.id);
    expect(fourth.workflow_completed).toBe(true);
    expect(executed.filter((id) => id === 't-research')).toHaveLength(1);
    expect(executed.filter((id) => id === 't-seo')).toHaveLength(1);
  });

  it('resume sau restart: task running dở dang về queued, dedup event bền qua restart', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wf-'));
    try {
      const store = new FileWorkflowStore(dir);
      const runner = new WorkflowRunner({ store, execute: okExecutor() });
      const wf = await runner.createWorkflow({ workspace_id: 'ws-1', tasks: campaignSpec(false) });
      await runner.dispatch(wf.id);
      expect((await store.getWorkflow(wf.id))!.state).toBe('completed');

      // Mô phỏng worker chết giữa chừng: đẩy t-report về running rồi "restart".
      await store.updateTask('t-report', { state: 'running' });
      const restartedStore = new FileWorkflowStore(dir);
      const restarted = new WorkflowRunner({ store: restartedStore, execute: okExecutor() });
      const outcome = await restarted.resume(wf.id);
      expect(outcome.workflow_completed).toBe(true);

      // Event dedup cũng bền qua restart.
      const event = { workflow_id: wf.id, task_id: null, type: 'cancelled' as const, dedup_key: 'cancel:wf:1' };
      const applied = await restarted.applyEvent(event);
      expect(applied.applied).toBe(true);
      const store3 = new FileWorkflowStore(dir);
      const runner3 = new WorkflowRunner({ store: store3, execute: okExecutor() });
      const dup = await runner3.applyEvent(event);
      expect(dup).toMatchObject({ applied: false, reason: 'DUPLICATE_EVENT' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});