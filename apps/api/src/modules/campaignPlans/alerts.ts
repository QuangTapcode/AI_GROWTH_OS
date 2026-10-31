import type { Pool } from 'pg';

export type Alert = { code: string; severity: 'critical' | 'warning'; message: string };

/** The worker ticks every 30 s; several missed ticks mean it stopped. */
const STALE_TICK_MS = 3 * 60_000;

/** Problems an owner must know about without reading logs, derived from stored state only. */
export async function workspaceAlerts(pool: Pool, workspaceId: string, now = new Date()): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const automation = (await pool.query<{ enabled: boolean; last_tick_at: Date | null; last_error: string | null }>(
    'SELECT enabled, last_tick_at, last_error FROM agent_automation WHERE workspace_id=$1', [workspaceId])).rows[0];
  if (automation?.enabled && (!automation.last_tick_at || now.getTime() - new Date(automation.last_tick_at).getTime() > STALE_TICK_MS)) {
    alerts.push({ code: 'WORKER_NOT_RUNNING', severity: 'critical',
      message: 'Tự động đang bật nhưng worker không chạy: không có lượt lập lịch nào trong 3 phút qua.' });
  }
  if (automation?.last_error) {
    alerts.push({ code: 'SCHEDULER_ERROR', severity: 'warning', message: `Lượt lập lịch gần nhất báo lỗi: ${automation.last_error}` });
  }
  const failures = (await pool.query<{ publishing_failed: number; replies_failed: number; tasks_failed: number }>(`SELECT
      (SELECT count(*)::int FROM publishing_jobs WHERE workspace_id=$1 AND status='failed' AND created_at > now() - interval '24 hours') AS publishing_failed,
      (SELECT count(*)::int FROM outbox_events WHERE workspace_id=$1 AND event_type='community.reply' AND status='failed'
         AND created_at > now() - interval '24 hours') AS replies_failed,
      (SELECT count(*)::int FROM workflow_tasks WHERE workspace_id=$1 AND status='failed' AND updated_at > now() - interval '24 hours') AS tasks_failed`,
    [workspaceId])).rows[0];
  if (failures?.publishing_failed) alerts.push({ code: 'PUBLISHING_FAILED', severity: 'warning',
    message: `${failures.publishing_failed} lần đăng bài thất bại trong 24 giờ qua. Xem lý do ở trang Phân phối.` });
  if (failures?.replies_failed) alerts.push({ code: 'REPLIES_FAILED', severity: 'warning',
    message: `${failures.replies_failed} câu trả lời Messenger không gửi được trong 24 giờ qua.` });
  if (failures?.tasks_failed) alerts.push({ code: 'TASKS_FAILED', severity: 'warning',
    message: `${failures.tasks_failed} task của agent bị lỗi trong 24 giờ qua. Xem chi tiết và chạy lại ở từng agent.` });
  return alerts;
}
