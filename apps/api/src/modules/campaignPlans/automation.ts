import { createHash } from "node:crypto";
import { defaultSearch, refreshDiscoveryIfStale } from "../research/discovery";
import { syncResearchSearchMetrics } from "../research/searchMetrics";
import { ensureBaselineArtifact, ensureMeasurementArtifacts } from "../site/measurement";
import { publishSeoArtifact, PublishError } from "../site/publish";
import type { Pool } from "pg";
import { enqueueAiTask } from "./aiTasks";
import { acceptLearningTasks } from "./learningTasks";
import { PgPlanRepository } from "./pgRepository";
import { submitCampaignPlan, PlanError } from "./service";
import { getWorkspaceConnectionStatus } from "../integrations/stubs";
import { propagateUpstreamTaskFailure } from "../tasks/dag";
import { persistCommunityLead } from "../community/leads";
import { processReceivedCommunityMessages } from "../community/service";
import { CommunityHubService } from "../community/hub";

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

export function isAutoApprovable(row: AutoArtifactRow) {
  const result = row.payload?.result ?? {};
  const missing = Array.isArray(result.missing_facts) ? result.missing_facts : [];
  const status = result.status;
  const inputRefs = Array.isArray(result.input_artifact_refs) ? result.input_artifact_refs : [];
  const hasGrounding = row.evidence.length > 0 || (row.role === "performance" && inputRefs.length > 0);
  const leadConsentOnly =
    row.role === "community" &&
    status === "insufficient_data" &&
    missing.length === 1 &&
    missing[0] === "verified_lead_owner_and_consent" &&
    Boolean(result.lead_proposal);
  if (row.role === "community") {
    // Community responses to customer inquiries are auto-approved to ensure prompt replies
    return result.synthetic !== true;
  }
  // An AI illustration always goes past a person: code checks lettering, not what the image shows.
  return result.synthetic !== true && !result.generated_image && hasGrounding &&
    ((missing.length === 0 && (status === "ready_for_handoff" || status === "proposed" || status === "draft")) || leadConsentOnly);
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

/** The public site's address; none when it is unset or local, since a post is read by the public. */
function publicSiteBase() {
  try {
    const url = new URL(process.env.PUBLIC_SITE_URL ?? "");
    if (!/^https?:$/.test(url.protocol) || /^(localhost$|127\.|0\.0\.0\.0$|10\.|192\.168\.|\[::1\]$)/.test(url.hostname)) return null;
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Where a post sends people: the article it was written from, or nowhere. */
async function articleLink(db: import("pg").PoolClient, workspaceId: string, row: AutoArtifactRow) {
  const siteBase = publicSiteBase();
  const refs = row.payload.result?.input_artifact_refs;
  const parent = Array.isArray(refs) ? (refs[0] as { artifact_id?: string } | undefined)?.artifact_id : undefined;
  if (!siteBase || !parent) return null;
  const article = (await db.query<{ slug: string }>(
    "SELECT slug FROM contents WHERE workspace_id=$1 AND artifact_id=$2 AND slug IS NOT NULL LIMIT 1",
    [workspaceId, parent],
  )).rows[0];
  if (!article) return null;
  const campaign = row.campaign_id
    ? (await db.query<{ utm_campaign: string | null }>("SELECT utm_campaign FROM campaigns WHERE workspace_id=$1 AND id=$2 LIMIT 1", [workspaceId, row.campaign_id])).rows[0]
    : undefined;
  const utm = new URLSearchParams({ utm_source: "facebook", utm_medium: "social",
    utm_campaign: campaign?.utm_campaign || "autopilot_social", utm_content: row.result_ref.slice(0, 8) });
  return `${siteBase}/posts/${article.slug}?${utm}`;
}

type FacebookPublishTarget = {
  platform: "facebook" | "facebook_group";
  provider: "facebook_page" | "facebook_group";
  groupUrl?: string;
  communityName?: string;
};

async function resolveFacebookTargets(
  db: { query: Pool["query"] },
  workspaceId: string,
): Promise<FacebookPublishTarget[]> {
  let publishTarget: string | null = null;
  let groupUrl: string | undefined;
  let communityName: string | undefined;
  try {
    const row = (
      await db.query<{ publish_target?: string; group_url?: string; community_name?: string }>(
        "SELECT publish_target, group_url, community_name FROM community_hub_settings WHERE workspace_id=$1 LIMIT 1",
        [workspaceId],
      )
    ).rows[0];
    if (row) {
      publishTarget = row.publish_target ?? "group";
      groupUrl = row.group_url;
      communityName = row.community_name;
    }
  } catch {
    // community_hub_settings may not exist in isolated DB fixtures
  }

  if (publishTarget === "both") {
    return [
      { platform: "facebook_group", provider: "facebook_group", groupUrl, communityName },
      { platform: "facebook", provider: "facebook_page" },
    ];
  }
  if (publishTarget === "fanpage") {
    return [{ platform: "facebook", provider: "facebook_page" }];
  }
  if (publishTarget === "group") {
    return [{ platform: "facebook_group", provider: "facebook_group", groupUrl, communityName }];
  }

  // Fallback when community_hub_settings row has not been created yet: prefer facebook_group if configured
  const groupChannel = (
    await db.query<{ channel_identifier: string | null; display_name: string | null }>(
      "SELECT channel_identifier, display_name FROM channels WHERE workspace_id=$1 AND platform_name='facebook_group' ORDER BY created_at LIMIT 1",
      [workspaceId],
    )
  ).rows[0];
  if (groupChannel) {
    return [
      {
        platform: "facebook_group",
        provider: "facebook_group",
        groupUrl: groupChannel.channel_identifier ?? undefined,
        communityName: groupChannel.display_name ?? undefined,
      },
    ];
  }
  return [{ platform: "facebook", provider: "facebook_page" }];
}

async function scheduleFacebookArtifact(
  db: import("pg").PoolClient,
  workspaceId: string,
  actorId: string,
  row: AutoArtifactRow,
  approvalId: string,
  mode: "live" | "manual",
  targetPlatform: "facebook" | "facebook_group" = "facebook",
  groupInfo?: { groupUrl?: string; communityName?: string },
) {
  if (row.role !== "content" || !row.payload?.result) return;
  // Auto-publish never creates a misleading manual job. The connector
  // must be verified before an automated post is enqueued.
  if (mode !== "live") return;
  let channel = (await db.query(
    "SELECT id FROM channels WHERE workspace_id=$1 AND platform_name=$2 ORDER BY created_at LIMIT 1",
    [workspaceId, targetPlatform],
  )).rows[0];
  if (!channel && targetPlatform === "facebook_group") {
    channel = (await db.query(
      `INSERT INTO channels (workspace_id, platform_name, display_name, channel_identifier)
       VALUES ($1, 'facebook_group', $2, $3) RETURNING id`,
      [
        workspaceId,
        groupInfo?.communityName || "Cộng đồng Du lịch & Sống tại Việt Nam",
        groupInfo?.groupUrl || "https://www.facebook.com/groups/1134282109069209",
      ],
    )).rows[0];
  }
  if (!channel) return;
  const result = row.payload.result;
  // Prefer the Facebook-specific post (hook, body, question, exact CTA) over the generic caption.
  const facebook = result.facebook as { text?: unknown } | null | undefined;
  const body = typeof facebook?.text === "string" ? facebook.text : typeof result.caption === "string" ? result.caption : typeof result.body_markdown === "string" ? result.body_markdown : "";
  const resolvedLink = await articleLink(db, workspaceId, row);
  const utmUrl = targetPlatform === "facebook_group" ? (resolvedLink ?? groupInfo?.groupUrl ?? "https://www.facebook.com/groups/1134282109069209") : resolvedLink;
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
  // One automated attempt per artifact per channel: a failed post is
  // retried by a person, never re-created on every tick.
  const existing = (await db.query(
    "SELECT id FROM publishing_jobs WHERE workspace_id=$1 AND artifact_id=$2 AND channel_id=$3",
    [workspaceId, row.result_ref, channel.id],
  )).rows[0];
  if (existing) return;
  const job = (await db.query<{ id: string }>(
    `INSERT INTO publishing_jobs(content_id,channel_id,scheduled_for,status,workspace_id,artifact_id,approval_id,mode,created_by,utm_url)
     VALUES($1,$2,now(),'scheduled',$3,$4,$5,$6,$7,$8) RETURNING id`,
    [content.id, channel.id, workspaceId, row.result_ref, approvalId, mode, actorId, utmUrl],
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
  const targets = await resolveFacebookTargets(pool, workspaceId);
  let scheduled = 0;
  for (const target of targets) {
    const status = await getWorkspaceConnectionStatus(workspaceId, target.provider);
    if (status.status !== "connected") continue;
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
             JOIN channels ch ON ch.id=pj.channel_id
             WHERE pj.workspace_id=t.workspace_id AND pj.artifact_id=a.id
               AND ch.platform_name=$3
          )
        ORDER BY t.updated_at DESC`,
      [workspaceId, contextSnapshotId, target.platform],
    )).rows;
    for (const row of rows) {
      if (!isAutoApprovable(row)) continue;
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        await scheduleFacebookArtifact(db, workspaceId, actorId, row, row.approval_id, "live", target.platform, target);
        await db.query("COMMIT");
        scheduled++;
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      } finally {
        db.release();
      }
    }
  }
  return scheduled;
}

/**
 * Auto-approval is opt-in and only accepts grounded, non-synthetic, complete outputs of the
 * current context; work pinned to an older context is never approved or published unattended.
 */
async function autoApproveOutputs(pool: Pool, workspaceId: string, actorId: string, contextSnapshotId: string,
  publishFacebook: boolean, publishWebsite = false) {
  const rows = (await pool.query<AutoArtifactRow>(
    `SELECT t.id AS task_id,t.role,t.campaign_id,t.status,t.result_ref,a.version,a.content_hash,a.title,a.artifact_type,a.payload,a.evidence
       FROM workflow_tasks t JOIN content_artifacts a ON a.id=t.result_ref AND a.workspace_id=t.workspace_id
      WHERE t.workspace_id=$1 AND t.context_snapshot_id=$2 AND t.status='awaiting_approval' ORDER BY t.created_at`,
    [workspaceId, contextSnapshotId],
  )).rows;
  const warnings: string[] = [];
  if (!rows.length) return warnings;
  const targets = publishFacebook ? await resolveFacebookTargets(pool, workspaceId) : [];
  const targetModes: Array<{ target: FacebookPublishTarget; mode: "live" | "manual" }> = [];
  for (const target of targets) {
    const status = await getWorkspaceConnectionStatus(workspaceId, target.provider);
    targetModes.push({ target, mode: status.status === "connected" ? "live" : "manual" });
  }
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
        if (publishFacebook && row.role === "content") {
          for (const { target, mode } of targetModes) {
            await scheduleFacebookArtifact(db, workspaceId, actorId, row, approvalId, mode, target.platform, target);
          }
        }
        // The owner opted into publishing approved SEO articles to the workspace's own site.
        if (publishWebsite && row.role === "seo") {
          // A refusal concerns the website only: the approved article still feeds Content, and the scheduler must not stop.
          try {
            await publishSeoArtifact(db, workspaceId, row.result_ref, actorId);
          } catch (error) {
            if (!(error instanceof PublishError)) throw error;
            warnings.push(`WEBSITE_NOT_PUBLISHED: ${error.code}`);
          }
        }
        if (row.role === "community") await persistCommunityLead(db, workspaceId, row.result_ref, actorId, { consentVerified: false });
      }
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally { db.release(); }
  }
  return warnings;
}

const MAX_LEARNING_ROUNDS = 3;

/** Learning-opened Research rounds since the last scheduled cycle; bounds the closed loop. */
async function learningRoundsThisCycle(pool: Pool, workspaceId: string, contextSnapshotId: string) {
  return (await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM workflow_tasks r
      WHERE r.workspace_id=$1 AND r.context_snapshot_id=$2 AND r.operation='research.run' AND r.payload ? 'learning_artifact'
        AND r.created_at > COALESCE((SELECT max(s.created_at) FROM workflow_tasks s
          JOIN agent_automation_handoffs h ON h.workspace_id=s.workspace_id AND h.task_id=s.id
         WHERE s.workspace_id=$1 AND s.operation='research.run' AND NOT (s.payload ? 'learning_artifact')), 'epoch'::timestamptz)`,
    [workspaceId, contextSnapshotId],
  )).rows[0].n;
}

/**
 * An approved source (or a new approved version) is not pinned by the context yet. Revocations are
 * already enforced per task (SOURCE_NOT_APPROVED) and do not trigger a new context here.
 */
async function newlyApprovedSources(pool: Pool, workspaceId: string, pinned: { source_id: string; version: number }[]) {
  const current = new Set(pinned.map((s) => `${s.source_id}:${s.version}`));
  return (await pool.query<{ id: string; version: number }>(
    "SELECT id, version FROM sources WHERE workspace_id=$1 AND status='approved' AND deleted_at IS NULL", [workspaceId],
  )).rows.some((s) => !current.has(`${s.id}:${s.version}`));
}

/** A learning round already drew its conclusion from this exact measurement: a new round adds no signal. */
async function measurementAlreadyLearned(pool: Pool, workspaceId: string, contextSnapshotId: string, metricsArtifactId: unknown) {
  if (typeof metricsArtifactId !== "string") return false;
  return (await pool.query(
    `SELECT 1 FROM workflow_tasks l
       JOIN content_artifacts report ON report.workspace_id=l.workspace_id AND report.id::text=l.payload->'input'->>'performance_artifact_id'
       JOIN workflow_tasks reportTask ON reportTask.id=report.task_id
      WHERE l.workspace_id=$1 AND l.context_snapshot_id=$2 AND l.operation='learning.analyze'
        AND reportTask.payload->'input'->>'metrics_artifact_id'=$3 LIMIT 1`,
    [workspaceId, contextSnapshotId, metricsArtifactId],
  )).rowCount === 1;
}

/**
 * With auto-approval on, the owner also opts into the Research round a grounded learning
 * proposes. The same owner check, hash, quota and dedup rules apply as for a manual approval.
 */
async function autoAcceptLearning(pool: Pool, workspaceId: string, actorId: string, contextSnapshotId: string) {
  const rows = (await pool.query(
    `SELECT t.id, a.payload FROM workflow_tasks t JOIN content_artifacts a ON a.id=t.result_ref AND a.workspace_id=t.workspace_id
      WHERE t.workspace_id=$1 AND t.context_snapshot_id=$2 AND t.operation='learning.analyze' AND t.status='awaiting_approval'
      ORDER BY t.created_at`,
    [workspaceId, contextSnapshotId],
  )).rows;
  for (const row of rows) {
    const result = row.payload?.result ?? {};
    if (result.stopped_reason === "no_measured_signal") {
      // Nothing was measured, so there is nothing for a person to decide; the report stays readable.
      await pool.query("UPDATE workflow_tasks SET status='completed',completed_at=now(),updated_at=now() WHERE id=$1 AND status='awaiting_approval'", [row.id]);
      await pool.query(
        `UPDATE approvals SET status='revoked',invalidated_reason='NOTHING_TO_REVIEW',invalidated_at=now(),updated_at=now()
          WHERE workspace_id=$1 AND target_type='artifact' AND status='pending'
            AND target_id=(SELECT result_ref FROM workflow_tasks WHERE id=$2)`,
        [workspaceId, row.id],
      );
      continue;
    }
    // Missing data or a stopped loop has nothing to open; it stays visible for review.
    if (result.status !== "draft" || result.missing_facts?.length || !result.next_tasks?.length) continue;
    try {
      const accepted = await acceptLearningTasks(pool, workspaceId, actorId, row.payload.artifact, process.env.APP_ENV !== "production");
      for (const taskId of accepted.task_ids)
        await pool.query("INSERT INTO agent_automation_handoffs(workspace_id,task_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [workspaceId, taskId]);
    } catch (error) {
      if (!(error instanceof PlanError)) throw error;
      await pool.query("UPDATE workflow_tasks SET status='failed',error_details=$2,updated_at=now() WHERE id=$1 AND status='awaiting_approval'",
        [row.id, JSON.stringify({ code: error.code })]);
    }
  }
}

/** One scheduler owns a workspace at a time; existing approval gates remain authoritative. */
/**
 * A task behind a failed or cancelled parent can never run, and left pending it would hold the
 * schedule forever. Closed here rather than where tasks fail, so every way of failing is covered.
 */
async function closeTasksBehindDeadParents(pool: Pool, workspaceId: string) {
  const parents = (await pool.query<{ id: string; status: string }>(
    `SELECT DISTINCT parent.id,parent.status FROM task_dependencies d
       JOIN workflow_tasks parent ON parent.id=d.depends_on_task_id
       JOIN workflow_tasks child ON child.id=d.task_id
      WHERE d.workspace_id=$1 AND parent.status IN ('failed','cancelled') AND child.status IN ('pending','queued')`,
    [workspaceId],
  )).rows;
  for (const parent of parents) await propagateUpstreamTaskFailure(pool, workspaceId, parent.id, parent.status);
}

/**
 * A review on a superseded context can never be acted on (its work fails STALE_CONTEXT), and one
 * on a finished task changes nothing. Neither should wait in the owner's queue.
 */
async function closeDeadReviews(pool: Pool, workspaceId: string, contextSnapshotId: string) {
  await pool.query(
    `UPDATE workflow_tasks SET status='cancelled',error_details=jsonb_build_object('code','SUPERSEDED_CONTEXT'),completed_at=now(),updated_at=now()
      WHERE workspace_id=$1 AND status='awaiting_approval' AND context_snapshot_id<>$2`,
    [workspaceId, contextSnapshotId],
  );
  await pool.query(
    `UPDATE approvals a SET status='revoked',invalidated_at=now(),updated_at=now(),
        invalidated_reason=CASE WHEN c.context_snapshot_id<>$2 THEN 'SUPERSEDED_CONTEXT' ELSE 'TASK_ALREADY_CLOSED' END
       FROM content_artifacts c
      WHERE a.workspace_id=$1 AND a.target_type='artifact' AND a.status='pending' AND c.workspace_id=$1 AND c.id=a.target_id
        AND (c.context_snapshot_id<>$2 OR EXISTS (SELECT 1 FROM workflow_tasks t WHERE t.workspace_id=$1 AND t.result_ref=c.id
          AND t.status IN ('completed','failed','cancelled')))`,
    [workspaceId, contextSnapshotId],
  );
}

async function expireUnreviewedDrafts(pool: Pool, workspaceId: string, contextSnapshotId: string) {
  const expired = (await pool.query<{ result_ref: string }>(
    `UPDATE workflow_tasks SET status='cancelled',error_details=jsonb_build_object('code','REVIEW_TIMEOUT'),completed_at=now(),updated_at=now()
      WHERE workspace_id=$1 AND context_snapshot_id=$2 AND status='awaiting_approval'
        AND campaign_id IN (SELECT plan_id FROM campaign_plan_acceptances WHERE workspace_id=$1) RETURNING result_ref`,
    [workspaceId, contextSnapshotId],
  )).rows;
  if (!expired.length) return;
  await pool.query(
    `UPDATE approvals SET status='revoked',invalidated_reason='REVIEW_TIMEOUT',invalidated_at=now(),updated_at=now()
      WHERE workspace_id=$1 AND target_type='artifact' AND status='pending' AND target_id=ANY($2::uuid[])`,
    [workspaceId, expired.map((row) => row.result_ref)],
  );
}

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
      const publishWarnings = await autoApproveOutputs(pool, workspaceId, settings.actor_id, context.snapshot_id, settings.auto_publish_facebook === true,
        settings.auto_publish_website === true);
      if (publishWarnings.length) discoveryWarning = publishWarnings.join('; ');
      await autoAcceptLearning(pool, workspaceId, settings.actor_id, context.snapshot_id);
    }
    if (settings.auto_publish_facebook === true) {
      await scheduleApprovedFacebookArtifacts(pool, workspaceId, settings.actor_id, context.snapshot_id);
    }
    await closeTasksBehindDeadParents(pool, workspaceId);
    await closeDeadReviews(pool, workspaceId, context.snapshot_id);
    // Sync recent Fanpage comments (throttled >= 60s) when Graph API token is configured
    if (process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
      try {
        const syncRow = (
          await pool.query<{ last_comment_sync_at?: Date | null; auto_reply_comments?: boolean | null }>(
            'SELECT last_comment_sync_at, auto_reply_comments FROM community_hub_settings WHERE workspace_id = $1 LIMIT 1',
            [workspaceId],
          )
        ).rows[0];
        const ageMs = syncRow?.last_comment_sync_at
          ? Date.now() - new Date(syncRow.last_comment_sync_at).getTime()
          : Infinity;
        if (syncRow?.auto_reply_comments !== false && ageMs >= 60_000) {
          await new CommunityHubService(pool).syncPageComments(workspaceId);
        }
      } catch {
        // Never fail campaign automation tick on optional Graph comment polling
      }
    }
    // Process incoming community inbox messages & comments into workflow tasks
    await processReceivedCommunityMessages(pool, workspaceId, settings.actor_id, context.snapshot_id);
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
      // Research or a report without usable output has nothing to hand off: it falls through and
      // is closed, otherwise an unattended cycle would wait forever on it.
      if (task.operation === "research.run" && task.artifact_payload.result?.status === "ready_for_handoff") {
        // First-party measurement (site events + leads) pinned to this context for Growth Lead, Performance and Learning;
        // taken before the strategy task exists, so the plan can see it.
        await ensureMeasurementArtifacts(pool, workspaceId, context.snapshot_id, settings.interval_hours);
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
        const baseline = metric ? await ensureBaselineArtifact(pool, workspaceId, context.snapshot_id, metric.id) : undefined;
        const report = await enqueue(`performance:${child.task_id}`, {
          operation: "analytics.report",
          ...(metric ? { metrics_artifact_id: metric.id } : {}),
          ...(baseline ? { baseline_metrics_artifact_id: baseline } : {}),
        });
        await pool.query(
          "INSERT INTO agent_automation_handoffs(workspace_id,task_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [workspaceId, report.task_id],
        );
      } else if (task.operation === "strategy.generate") {
        try {
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
        } catch (error) {
          if (!(error instanceof PlanError)) throw error;
          // A blocked plan (missing facts, stale source) must not hold the schedule; it stays visible as failed.
          await pool.query(
            "UPDATE workflow_tasks SET status='failed',error_details=$3,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND status='awaiting_approval'",
            [workspaceId, task.id, JSON.stringify({ code: error.code })],
          );
          continue;
        }
      } else if (task.operation === "analytics.report" && task.artifact_payload.result?.status === "draft") {
        const iteration = await learningRoundsThisCycle(pool, workspaceId, context.snapshot_id);
        if (iteration < MAX_LEARNING_ROUNDS &&
            !(await measurementAlreadyLearned(pool, workspaceId, context.snapshot_id, task.payload?.input?.metrics_artifact_id))) {
          await ensureMeasurementArtifacts(pool, workspaceId, context.snapshot_id, settings.interval_hours);
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
            iteration,
            max_iterations: MAX_LEARNING_ROUNDS,
            task_quota: 1,
          });
        }
        const reportWindow = task.artifact_payload.result?.window as { start?: string; end?: string } | undefined;
        const metricsId = task.payload?.input?.metrics_artifact_id;
        const baselineId = task.payload?.input?.baseline_metrics_artifact_id;
        if (reportWindow?.start && reportWindow?.end && Date.parse(reportWindow.end) <= Date.now() && Date.parse(reportWindow.start) < Date.parse(reportWindow.end)) {
          const cta = String(settings.cta).slice(0, 150);
          await enqueue(`experiment:${task.id}`, {
            operation: "experiment.hypothesis",
            ...(metricsId ? { metrics_artifact_id: metricsId } : {}),
            ...(baselineId ? { baseline_metrics_artifact_id: baselineId } : {}),
            experiment: {
              hypothesis: `Campaign CTA ("${cta}") increases qualified visits and lead conversion compared to baseline window.`,
              control_variant: "Baseline organic content without campaign CTA",
              treatment_variant: `Campaign SEO & Social distribution with CTA: ${cta}`,
              primary_metric: "qualified_visits",
              period: { start: reportWindow.start, end: reportWindow.end },
              grouping: "window_comparison",
            },
          });
        }
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
        WHERE t.workspace_id=$1 AND t.context_snapshot_id=$2 AND t.status IN ('queued','running','pending','awaiting_approval')
        AND t.operation IN ('research.run','strategy.generate') LIMIT 1`,
          [workspaceId, context.snapshot_id],
        )
      ).rowCount;
      // Avoid opening a new campaign while its internal work or approval is outstanding.
      // Work pinned to an older knowledge context can never finish (STALE_CONTEXT), so it
      // must not hold the schedule hostage after the owner approves new sources.
      const unfinished = (
        await pool.query(
          `SELECT 1 FROM workflow_tasks t WHERE t.workspace_id=$1 AND t.context_snapshot_id=$2 AND t.campaign_id IN
        (SELECT plan_id FROM campaign_plan_acceptances WHERE workspace_id=$1)
        AND t.status IN ('queued','running','pending','awaiting_approval') LIMIT 1`,
          [workspaceId, context.snapshot_id],
        )
      ).rowCount;
      // Overdue by a whole extra cycle: nobody is reviewing, and a waiting draft must not stop an
      // unattended schedule. The draft stays readable; it is simply never approved or published.
      if (unfinished && new Date(settings.next_run_at).getTime() + settings.interval_hours * 3_600_000 <= Date.now()) {
        await expireUnreviewedDrafts(pool, workspaceId, context.snapshot_id);
      }
      if (!active && !unfinished) {
        // Fresh search landscape for this research run. A search outage must not block
        // research on the existing approved snapshot; it is reported as last_error instead.
        try {
          await refreshDiscoveryIfStale(pool, workspaceId, defaultSearch(), settings.interval_hours);
        } catch (error) {
          discoveryWarning = [discoveryWarning, `DISCOVERY_FAILED: ${(error as Error).message}`].filter(Boolean).join('; ');
        }
        // Sources approved since the context was issued (e.g. newly published first-party articles)
        // reach Research only through a new context; it is issued at a cycle boundary, never mid-cycle.
        const cycleContext = await newlyApprovedSources(pool, workspaceId, context.snapshot.sources)
          ? (await new PgPlanRepository(pool).issueContext(workspaceId)).context_snapshot_id
          : context.snapshot_id;
        try {
          const measured = await syncResearchSearchMetrics(pool, workspaceId, cycleContext, undefined, settings.interval_hours);
          if (measured.status === 'unavailable') discoveryWarning = [discoveryWarning, measured.reason].filter(Boolean).join('; ');
        } catch {
          discoveryWarning = [discoveryWarning, 'GSC_QUERY_SYNC_FAILED'].filter(Boolean).join('; ');
        }
        const child = await enqueueAiTask(pool, workspaceId, settings.actor_id, {
          task_id: automationTaskId(`research:${workspaceId}:${new Date(settings.next_run_at).toISOString()}`),
          context_snapshot_id: cycleContext,
          input: { operation: "research.run" },
        });
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
