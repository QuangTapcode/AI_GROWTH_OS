import type { PoolClient } from "pg";
import { query } from "../../lib/db";

export interface ChannelRow {
  id: string;
  workspace_id: string;
  platform_name: string;
  channel_identifier: string | null;
  display_name: string | null;
  created_at: string;
}

export interface PublishingJobRow {
  id: string;
  workspace_id: string;
  content_id: string;
  channel_id: string;
  artifact_id: string | null;
  approval_id: string | null;
  scheduled_for: string;
  published_at: string | null;
  status: string;
  mode: string;
  utm_url: string | null;
  external_post_id: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  content_title: string;
  artifact_version: number | null;
  platform_name: string;
  channel_name: string | null;
}

const JOB_SELECT = `
  SELECT j.id, j.workspace_id, j.content_id, j.channel_id, j.artifact_id, j.approval_id, j.scheduled_for,
         j.published_at, j.status, j.mode, j.utm_url, j.external_post_id, j.error_message, j.created_by, j.created_at,
         c.title AS content_title, a.version AS artifact_version, ch.platform_name, ch.display_name AS channel_name
  FROM publishing_jobs j
  JOIN contents c ON c.id = j.content_id AND c.workspace_id = j.workspace_id
  JOIN channels ch ON ch.id = j.channel_id AND ch.workspace_id = j.workspace_id
  LEFT JOIN content_artifacts a ON a.id = j.artifact_id`;

export async function listChannels(workspaceId: string): Promise<ChannelRow[]> {
  const res = await query<ChannelRow>(
    `SELECT id, workspace_id, platform_name, channel_identifier, display_name, created_at
     FROM channels WHERE workspace_id = $1 ORDER BY created_at ASC`,
    [workspaceId]
  );
  return res.rows;
}

export async function insertChannel(
  workspaceId: string,
  input: { platform_name: string; display_name: string; channel_identifier?: string | null }
): Promise<ChannelRow> {
  const res = await query<ChannelRow>(
    `INSERT INTO channels (workspace_id, platform_name, display_name, channel_identifier)
     VALUES ($1, $2, $3, $4)
     RETURNING id, workspace_id, platform_name, channel_identifier, display_name, created_at`,
    [workspaceId, input.platform_name, input.display_name, input.channel_identifier ?? null]
  );
  return res.rows[0];
}

export async function getChannel(client: PoolClient, workspaceId: string, channelId: string) {
  const res = await client.query<ChannelRow>(
    `SELECT id, workspace_id, platform_name, channel_identifier, display_name, created_at
     FROM channels WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, channelId]
  );
  return res.rows[0] || null;
}

export async function listJobs(workspaceId: string): Promise<PublishingJobRow[]> {
  const res = await query<PublishingJobRow>(`${JOB_SELECT} WHERE j.workspace_id = $1 ORDER BY j.scheduled_for DESC`, [
    workspaceId,
  ]);
  return res.rows;
}

export async function getJob(client: PoolClient, workspaceId: string, jobId: string, lock = false) {
  const res = await client.query<{ id: string; status: string; content_id: string }>(
    `SELECT id, status, content_id FROM publishing_jobs WHERE workspace_id = $1 AND id = $2${lock ? " FOR UPDATE" : ""}`,
    [workspaceId, jobId]
  );
  return res.rows[0] || null;
}

export async function getJobView(client: PoolClient, workspaceId: string, jobId: string): Promise<PublishingJobRow> {
  const res = await client.query<PublishingJobRow>(`${JOB_SELECT} WHERE j.workspace_id = $1 AND j.id = $2`, [
    workspaceId,
    jobId,
  ]);
  return res.rows[0];
}

/** Artifact + approval mới nhất của artifact đó (khóa để tránh lịch đăng song song khi approval đổi). */
export async function getArtifactForPublishing(client: PoolClient, workspaceId: string, artifactId: string) {
  const art = await client.query<{
    id: string;
    title: string;
    version: number;
    content_hash: string;
    artifact_type: string;
    payload: Record<string, unknown>;
  }>(
    `SELECT id, title, version, content_hash, artifact_type, payload
     FROM content_artifacts WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, artifactId]
  );
  if (art.rowCount === 0) return null;
  const approval = await client.query<{
    id: string;
    status: string;
    target_version: number;
    target_hash: string;
    actor_id: string | null;
  }>(
    `SELECT id, status, target_version, target_hash, actor_id FROM approvals
     WHERE workspace_id = $1 AND target_type = 'artifact' AND target_id = $2
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [workspaceId, artifactId]
  );
  return { artifact: art.rows[0], approval: approval.rows[0] || null };
}

/** contents là bản nội dung để đăng; mỗi artifact version đã duyệt map 1 dòng contents. */
export async function upsertContentForArtifact(
  client: PoolClient,
  workspaceId: string,
  artifact: { id: string; title: string; version: number; content_hash: string; artifact_type: string; payload: Record<string, unknown> },
  approvedBy: string | null
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM contents WHERE workspace_id = $1 AND artifact_id = $2`,
    [workspaceId, artifact.id]
  );
  if (existing.rowCount && existing.rowCount > 0) return existing.rows[0].id;
  const body =
    typeof artifact.payload?.document_markdown === "string"
      ? artifact.payload.document_markdown
      : typeof artifact.payload?.summary === "string"
      ? artifact.payload.summary
      : null;
  const res = await client.query<{ id: string }>(
    `INSERT INTO contents (workspace_id, title, body_markdown, type, status, created_by, approved_by,
       current_version, content_hash, artifact_id)
     VALUES ($1, $2, $3, $4, 'approved', 'ai', $5, $6, $7, $8) RETURNING id`,
    [workspaceId, artifact.title, body, artifact.artifact_type, approvedBy, artifact.version, artifact.content_hash, artifact.id]
  );
  return res.rows[0].id;
}

export async function getWebsiteUrl(client: PoolClient, workspaceId: string): Promise<string | null> {
  const res = await client.query<{ website_url: string | null }>(
    `SELECT website_url FROM business_profiles WHERE workspace_id = $1`,
    [workspaceId]
  );
  return res.rows[0]?.website_url ?? null;
}

export async function insertAudit(
  client: PoolClient,
  workspaceId: string,
  actorId: string,
  action: string,
  entityId: string,
  details: Record<string, unknown>
) {
  await client.query(
    `INSERT INTO audit_events (workspace_id, actor_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, 'publishing_job', $4, $5)`,
    [workspaceId, actorId, action, entityId, JSON.stringify(details)]
  );
}

export async function insertOutbox(
  client: PoolClient,
  workspaceId: string,
  eventType: string,
  dedupKey: string,
  payload: Record<string, unknown>
) {
  await client.query(
    `INSERT INTO outbox_events (workspace_id, event_type, dedup_key, payload)
     VALUES ($1, $2, $3, $4) ON CONFLICT (workspace_id, dedup_key) DO NOTHING`,
    [workspaceId, eventType, dedupKey, JSON.stringify(payload)]
  );
}
