import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { enqueueAiTask } from "./aiTasks";
import { PgPlanRepository } from "./pgRepository";
import { submitCampaignPlan, PlanError } from "./service";

// Stable IDs make a crash between enqueue and acknowledgement safe to replay.
export function automationTaskId(key: string) {
  const hex = createHash("sha256").update(key).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** One scheduler owns a workspace at a time; existing approval gates remain authoritative. */
export async function tickAutomation(
  pool: Pool,
  workspaceId: string,
  force = false,
) {
  const lock = await pool.connect();
  let acquired = false;
  try {
    acquired = (
      await lock.query(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
        [`automation:${workspaceId}`],
      )
    ).rows[0].acquired;
    if (!acquired) return { skipped: "busy" };
    const settings = (
      await pool.query("SELECT * FROM agent_automation WHERE workspace_id=$1", [
        workspaceId,
      ])
    ).rows[0];
    if (!settings || (!settings.enabled && !force))
      return { skipped: "disabled" };
    const owner = (
      await pool.query(
        "SELECT 1 FROM memberships WHERE workspace_id=$1 AND user_id=$2 AND role='owner' AND status='active'",
        [workspaceId, settings.actor_id],
      )
    ).rowCount;
    if (!owner)
      throw new PlanError(
        "AUTOMATION_OWNER_REVOKED",
        "Automation owner is no longer active",
        403,
      );
    const context = (
      await pool.query(
        "SELECT * FROM knowledge_contexts WHERE workspace_id=$1 AND current",
        [workspaceId],
      )
    ).rows[0];
    if (!context?.snapshot?.sources?.length)
      throw new PlanError(
        "MISSING_CONTEXT",
        "Create a current knowledge context with approved sources first",
      );
    const enqueue = (key: string, input: unknown) =>
      enqueueAiTask(pool, workspaceId, settings.actor_id, {
        task_id: automationTaskId(key),
        context_snapshot_id: context.snapshot_id,
        input,
      });
    // Consume only this automation's research/strategy, never unrelated manual work.
    const ready = (
      await pool.query(
        `SELECT t.*,a.payload AS artifact_payload FROM workflow_tasks t
      JOIN content_artifacts a ON a.id=t.result_ref AND a.workspace_id=t.workspace_id
      JOIN agent_automation_handoffs origin ON origin.workspace_id=t.workspace_id AND origin.task_id=t.id
      WHERE t.workspace_id=$1 AND t.context_snapshot_id=$2 AND t.status='awaiting_approval'
      AND t.operation IN ('research.run','strategy.generate','analytics.report') ORDER BY t.created_at`,
        [workspaceId, context.snapshot_id],
      )
    ).rows;
    for (const task of ready) {
      if (task.operation === "research.run") {
        if (task.artifact_payload.result?.status !== "ready_for_handoff")
          continue;
        const child = await enqueue(`strategy:${task.id}`, {
          operation: "strategy.generate",
          research_artifact_id: task.result_ref,
          cta: settings.cta,
          deadline: new Date(
            new Date(task.created_at).getTime() + 7 * 86400000,
          ).toISOString(),
        });
        await pool.query(
          "INSERT INTO agent_automation_handoffs(workspace_id,task_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [workspaceId, child.task_id],
        );
        const metric = (
          await pool.query(
            "SELECT id FROM content_artifacts WHERE workspace_id=$1 AND context_snapshot_id=$2 AND operation='metrics.snapshot' ORDER BY created_at DESC LIMIT 1",
            [workspaceId, context.snapshot_id],
          )
        ).rows[0];
        const report = await enqueue(`performance:${child.task_id}`, {
          operation: "analytics.report",
          ...(metric ? { metrics_artifact_id: metric.id } : {}),
        });
        await pool.query(
          "INSERT INTO agent_automation_handoffs(workspace_id,task_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [workspaceId, report.task_id],
        );
      } else if (task.operation === "strategy.generate") {
        await submitCampaignPlan(
          { repo: new PgPlanRepository(pool) },
          workspaceId,
          task.artifact_payload.artifact,
        );
      } else {
        if (task.artifact_payload.result?.status !== "draft") continue;
        const leads = (
          await pool.query(
            "SELECT id FROM content_artifacts WHERE workspace_id=$1 AND context_snapshot_id=$2 AND operation='lead.aggregate' ORDER BY created_at DESC LIMIT 1",
            [workspaceId, context.snapshot_id],
          )
        ).rows[0];
        await enqueue(`learning:${task.id}`, {
          operation: "learning.analyze",
          performance_artifact_id: task.result_ref,
          ...(leads ? { lead_summary_artifact_id: leads.id } : {}),
          iteration: 0,
          max_iterations: 3,
          task_quota: 1,
        });
      }
      await pool.query(
        "UPDATE workflow_tasks SET status='completed',completed_at=now(),updated_at=now() WHERE workspace_id=$1 AND id=$2 AND status='awaiting_approval'",
        [workspaceId, task.id],
      );
    }
    if (force || new Date(settings.next_run_at).getTime() <= Date.now()) {
      const active = (
        await pool.query(
          `SELECT 1 FROM workflow_tasks t JOIN agent_automation_handoffs h ON h.task_id=t.id
        WHERE t.workspace_id=$1 AND t.status IN ('queued','running','pending','awaiting_approval')
        AND t.operation IN ('research.run','strategy.generate') LIMIT 1`,
          [workspaceId],
        )
      ).rowCount;
      // Avoid opening a new campaign while its internal work or approval is outstanding.
      const unfinished = (
        await pool.query(
          `SELECT 1 FROM workflow_tasks t WHERE t.workspace_id=$1 AND t.campaign_id IN
        (SELECT plan_id FROM campaign_plan_acceptances WHERE workspace_id=$1)
        AND t.status IN ('queued','running','pending','awaiting_approval') LIMIT 1`,
          [workspaceId],
        )
      ).rowCount;
      if (!active && !unfinished) {
        const child = await enqueue(
          `research:${workspaceId}:${new Date(settings.next_run_at).toISOString()}`,
          { operation: "research.run" },
        );
        await pool.query(
          "INSERT INTO agent_automation_handoffs(workspace_id,task_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [workspaceId, child.task_id],
        );
        await pool.query(
          "UPDATE agent_automation SET next_run_at=now()+interval_hours*interval '1 hour' WHERE workspace_id=$1",
          [workspaceId],
        );
      }
    }
    await pool.query(
      "UPDATE agent_automation SET last_tick_at=now(),last_error=NULL WHERE workspace_id=$1",
      [workspaceId],
    );
    return { status: "ok" };
  } catch (error) {
    await pool.query(
      "UPDATE agent_automation SET last_tick_at=now(),last_error=$2 WHERE workspace_id=$1",
      [workspaceId, (error as Error).message],
    );
    throw error;
  } finally {
    if (acquired)
      await lock.query("SELECT pg_advisory_unlock(hashtext($1))", [
        `automation:${workspaceId}`,
      ]);
    lock.release();
  }
}
