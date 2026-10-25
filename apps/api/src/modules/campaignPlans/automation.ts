import { createHash } from "node:crypto";
import { defaultSearch, refreshDiscoveryIfStale } from "../research/discovery";
import type { Pool } from "pg";
import { enqueueAiTask } from "./aiTasks";
import { PgPlanRepository } from "./pgRepository";
import { submitCampaignPlan, PlanError } from "./service";
import { getWorkspaceConnectionStatus } from "../integrations/stubs";

// Stable IDs make a crash between enqueue and acknowledgement safe to replay.
export function automationTaskId(key: string) {
  const hex = createHash("sha256").update(key).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

type AutoArtifactRow = {
  task_id: string;
  role: string;
  campaign_id: string | null;
  status: string;
  result_ref: string;
  version: number;
  content_hash: string;
  title: string;
  artifact_type: string;
  payload: { artifact?: Record<string, unknown>; result?: Record<string, unknown> };
  evidence: unknown[];
};

function isAutoApprovable(row: AutoArtifactRow) {
  const result = row.payload?.result ?? {};
  const missing = Array.isArray(result.missing_facts) ? result.missing_facts : [];
  const status = result.status;
  return result.synthetic !== true && row.evidence.length > 0 && missing.length === 0 &&
    (status === "ready_for_handoff" || status === "proposed" || status === "draft");
}

async function queueReadyChildren(db: import("pg").PoolClient, workspaceId: string, campaignId: string | null) {
  if (!campaignId) return [] as string[];
  const children = (await db.query(
    `SELECT t.* FROM workflow_tasks t WHERE t.workspace_id=$1 AND t.campaign_id=$2 AND t.status='pending'
      AND NOT EXISTS(SELECT 1 FROM task_dependencies d JOIN workflow_tasks parent ON parent.id=d.depends_on_task_id
        WHERE d.task_id=t.id AND parent.status<>'completed') FOR UPDATE`,
    [workspaceId, campaignId],
  )).rows;
  for (const child of children) {
    await db.query("UPDATE workflow_tasks SET status='queued',updated_at=now() WHERE id=$1", [child.id]);
    await db.query(
      "INSERT INTO plan_task_outbox(workspace_id,task_id,input_version,operation) VALUES($1,$2,$3,$4) ON CONFLICT(task_id,input_version) DO NOTHING",
      [workspaceId, child.id, child.input_version, child.operation],
    );
  }
  return children.map((child) => child.id as string);
}

async function scheduleFacebookArtifact(
  db: import("pg").PoolClient,
  workspaceId: string,
  actorId: string,
  row: AutoArtifactRow,
  approvalId: string,
  mode: "live" | "manual",
) {
  if (row.role !== "content" || !row.payload?.result) return;
  // Auto-publish never creates a misleading manual job. The Facebook
  // connector must be verified before an automated post is enqueued.
  if (mode !== "live") return;
  const channel = (await db.query(
    "SELECT id FROM channels WHERE workspace_id=$1 AND platform_name='facebook' ORDER BY created_at LIMIT 1",
    [workspaceId],
  )).rows[0];
  if (!channel) return;
  const result = row.payload.result;
  // Prefer the Facebook-specific post (hook, body, question, exact CTA) over the generic caption.
  const facebook = result.facebook as { text?: unknown } | null | undefined;
  const body = typeof facebook?.text === "string" ? facebook.text : typeof result.caption === "string" ? result.caption : typeof result.body_markdown === "string" ? result.body_markdown : "";
  const content = (await db.query<{ id: string }>(
    `INSERT INTO contents (workspace_id,title,body_markdown,type,status,created_by,approved_by,current_version,content_hash,artifact_id)
     VALUES($1,$2,$3,'social_post','approved','ai',$4,$5,$6,$7)
     ON CONFLICT DO NOTHING RETURNING id`,
    [workspaceId, row.title, body, actorId, row.version, row.content_hash, row.result_ref],
  )).rows[0] ?? (await db.query<{ id: string }>(
    "SELECT id FROM contents WHERE workspace_id=$1 AND artifact_id=$2",
    [workspaceId, row.result_ref],
  )).rows[0];
  if (!content) return;
  const existing = (await db.query(
    "SELECT id FROM publishing_jobs WHERE workspace_id=$1 AND artifact_id=$2 AND channel_id=$3 AND status IN ('scheduled','publishing')",
    [workspaceId, row.result_ref, channel.id],
  )).rows[0];
  if (existing) return;
  const job = (await db.query<{ id: string }>(
    `INSERT INTO publishing_jobs(content_id,channel_id,scheduled_for,status,workspace_id,artifact_id,approval_id,mode,created_by)
     VALUES($1,$2,now(),'scheduled',$3,$4,$5,$6,$7) RETURNING id`,
    [content.id, channel.id, workspaceId, row.result_ref, approvalId, mode, actorId],
  )).rows[0];
  await db.query(
    `INSERT INTO outbox_events(workspace_id,event_type,dedup_key,payload)
     VALUES($1,'publishing.scheduled',$2,$3)
     ON CONFLICT(workspace_id,dedup_key) DO NOTHING`,
    [workspaceId, `publish:${job.id}`, JSON.stringify({ job_id: job.id, artifact_id: row.result_ref, approval_id: approvalId, channel_id: channel.id, mode })],
  );
}

/**
 * A credential can be connected after an artifact was already auto-approved.
 * Reconcile those approved Facebook artifacts on every tick so enabling the
 * connector does not require generating duplicate content or asking for a
 * second approval.
 */
async function scheduleApprovedFacebookArtifacts(
  pool: Pool,
  workspaceId: string,
  actorId: string,
  contextSnapshotId: string,
) {
  const status = await getWorkspaceConnectionStatus(workspaceId, "facebook_page");
  if (status.status !== "connected") return 0;
  const rows = (await pool.query<AutoArtifactRow & { approval_id: string }>(
    `SELECT t.id AS task_id,t.role,t.campaign_id,t.status,t.result_ref,
            a.version,a.content_hash,a.title,a.artifact_type,a.payload,a.evidence,
            ap.id AS approval_id
       FROM workflow_tasks t
       JOIN content_artifacts a ON a.id=t.result_ref AND a.workspace_id=t.workspace_id
       JOIN approvals ap ON ap.workspace_id=t.workspace_id
          AND ap.target_type='artifact' AND ap.target_id=a.id
          AND ap.target_version=a.version AND ap.target_hash=a.content_hash
          AND ap.status='approved'
      WHERE t.workspace_id=$1 AND t.context_snapshot_id=$2
        AND t.role='content' AND t.status='completed'
        AND NOT EXISTS (
          SELECT 1 FROM publishing_jobs pj
           WHERE pj.workspace_id=t.workspace_id AND pj.artifact_id=a.id
             AND pj.status IN ('scheduled','publishing','published')
        )
      ORDER BY t.updated_at DESC`,
    [workspaceId, contextSnapshotId],
  )).rows;
  let scheduled = 0;
  for (const row of rows) {
    if (!isAutoApprovable(row)) continue;
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await scheduleFacebookArtifact(db, workspaceId, actorId, row, row.approval_id, "live");
      await db.query("COMMIT");
      scheduled++;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
  return scheduled;
}

/** Auto-approval is opt-in and only accepts grounded, non-synthetic, complete outputs. */
async function autoApproveOutputs(pool: Pool, workspaceId: string, actorId: string, publishFacebook: boolean) {
  const rows = (await pool.query<AutoArtifactRow>(
    `SELECT t.id AS task_id,t.role,t.campaign_id,t.status,t.result_ref,a.version,a.content_hash,a.title,a.artifact_type,a.payload,a.evidence
       FROM workflow_tasks t JOIN content_artifacts a ON a.id=t.result_ref AND a.workspace_id=t.workspace_id
      WHERE t.workspace_id=$1 AND t.status='awaiting_approval' ORDER BY t.created_at`,
    [workspaceId],
  )).rows;
  if (!rows.length) return 0;
  let approved = 0;
  const fbStatus = publishFacebook ? await getWorkspaceConnectionStatus(workspaceId, "facebook_page") : null;
  const mode = fbStatus?.status === "connected" ? "live" : "manual";
  for (const row of rows) {
    if (!isAutoApprovable(row)) continue;
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const locked = (await db.query("SELECT status FROM workflow_tasks WHERE workspace_id=$1 AND id=$2 FOR UPDATE", [workspaceId, row.task_id])).rows[0];
      if (locked?.status !== "awaiting_approval") { await db.query("ROLLBACK"); continue; }
      const pending = (await db.query(
        `UPDATE approvals SET status='approved',decision='approve',actor_id=$3,actor_role='owner',review_note='Auto-approved: grounded citation and complete facts',updated_at=now()
          WHERE workspace_id=$1 AND target_type='artifact' AND target_id=$2 AND target_version=$4 AND target_hash=$5 AND status='pending' RETURNING id`,
        [workspaceId, row.result_ref, actorId, row.version, row.content_hash],
      )).rows[0];
      const approvalId = pending?.id ?? (await db.query<{ id: string }>(
        `INSERT INTO approvals(workspace_id,target_type,target_id,target_version,target_hash,status,decision,actor_id,actor_role,review_note)
         VALUES($1,'artifact',$2,$3,$4,'approved','approve',$5,'owner','Auto-approved: grounded citation and complete facts') RETURNING id`,
        [workspaceId, row.result_ref, row.version, row.content_hash, actorId],
      )).rows[0].id;
      const hasAutomationHandoff = (await db.query(
        "SELECT 1 FROM agent_automation_handoffs WHERE workspace_id=$1 AND task_id=$2",
        [workspaceId, row.task_id],
      )).rowCount === 1;
      if (!hasAutomationHandoff) {
        await db.query("UPDATE workflow_tasks SET status='completed',completed_at=now(),updated_at=now(),error_details=NULL WHERE id=$1", [row.task_id]);
        await queueReadyChildren(db, workspaceId, row.campaign_id);
        if (publishFacebook && row.role === "content") await scheduleFacebookArtifact(db, workspaceId, actorId, row, approvalId, mode);
      }
      await db.query("COMMIT");
      approved++;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally { db.release(); }
  }
  return approved;
}

/** One scheduler owns a workspace at a time; existing approval gates remain authoritative. */
export async function tickAutomation(
  pool: Pool,
  workspaceId: string,
  force = false,
) {
  const lock = await pool.connect();
  let acquired = false;
  let discoveryWarning: string | null = null;
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
    if (settings.auto_approve_outputs) {
      await autoApproveOutputs(pool, workspaceId, settings.actor_id, settings.auto_publish_facebook === true);
    }
    if (settings.auto_publish_facebook === true) {
      await scheduleApprovedFacebookArtifacts(pool, workspaceId, settings.actor_id, context.snapshot_id);
    }
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
          {
            repo: new PgPlanRepository(pool),
            // Synthetic artifacts are only used by the deterministic staging
            // smoke fixture. Production must continue to reject them.
            allowSynthetic: process.env.APP_ENV !== "production",
          },
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
        // Fresh search landscape for this research run. A search outage must not block
        // research on the existing approved snapshot; it is reported as last_error instead.
        try {
          await refreshDiscoveryIfStale(pool, workspaceId, defaultSearch(), settings.interval_hours);
        } catch (error) {
          discoveryWarning = `DISCOVERY_FAILED: ${(error as Error).message}`;
        }
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
      "UPDATE agent_automation SET last_tick_at=now(),last_error=$2 WHERE workspace_id=$1",
      [workspaceId, discoveryWarning],
    );
    return discoveryWarning ? { status: "ok", warning: discoveryWarning } : { status: "ok" };
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
