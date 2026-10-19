import { AppError } from "../../lib/errors";
import { AuthUser } from "../../lib/auth";
import { withTransaction } from "../../lib/db";
import { resolveTenantContext, requireRole } from "../../lib/tenant";
import { getConnectionStatus } from "../integrations/stubs";
import type { IntegrationProvider } from "../integrations/types";
import { createChannelSchema, schedulePublishSchema, updatePublishingJobSchema } from "./schemas";
import * as repo from "./repository";

/**
 * Distribution: xếp lịch đăng nội dung ĐÃ DUYỆT lên kênh.
 * - Chỉ artifact có approval mới nhất = approved và khớp đúng version + hash mới được xếp lịch.
 * - Kênh chưa kết nối (integration matrix not_connected) → mode "manual": người đăng tay rồi mark_published.
 * - Ghi outbox_events (publishing.scheduled) + audit_events trong cùng transaction.
 */

const PROVIDER_BY_PLATFORM: Partial<Record<string, IntegrationProvider>> = {
  website: "website_cms",
  facebook: "facebook_page",
  instagram: "instagram_business",
};

function parseOrThrow<T>(result: { success: true; data: T } | { success: false; error: { issues: Array<{ path: (string | number)[]; message: string }> } }, message: string): T {
  if (result.success) return result.data;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join(".") || "(root)";
    fieldErrors[field] = fieldErrors[field] || [];
    fieldErrors[field].push(issue.message);
  }
  throw new AppError(422, "VALIDATION_FAILED", message, fieldErrors);
}

function publishMode(workspaceId: string, platform: string): "live" | "manual" {
  const provider = PROVIDER_BY_PLATFORM[platform];
  if (!provider) return "manual";
  return (getConnectionStatus(workspaceId, provider).status as string) === "connected" ? "live" : "manual";
}

function buildUtmUrl(base: string | null, platform: string, campaign: string, artifactId: string): string | null {
  if (!base) return null;
  try {
    const url = new URL(base);
    url.searchParams.set("utm_source", platform);
    url.searchParams.set("utm_medium", platform === "website" ? "organic" : platform === "email" ? "email" : "social");
    url.searchParams.set("utm_campaign", campaign);
    url.searchParams.set("utm_content", artifactId.slice(0, 8));
    return url.toString();
  } catch {
    return null;
  }
}

export async function listWorkspaceChannels(user: AuthUser, workspaceId: string) {
  await resolveTenantContext(user, workspaceId);
  const channels = await repo.listChannels(workspaceId);
  return { items: channels.map((c) => ({ ...c, publish_mode: publishMode(workspaceId, c.platform_name) })) };
}

export async function createWorkspaceChannel(user: AuthUser, workspaceId: string, rawInput: unknown) {
  const ctx = await resolveTenantContext(user, workspaceId);
  requireRole(ctx, ["owner"]);
  const input = parseOrThrow(createChannelSchema.safeParse(rawInput), "Invalid channel payload");
  const channel = await repo.insertChannel(workspaceId, input);
  return { ...channel, publish_mode: publishMode(workspaceId, channel.platform_name) };
}

export async function listPublishingJobs(user: AuthUser, workspaceId: string) {
  await resolveTenantContext(user, workspaceId);
  return { items: await repo.listJobs(workspaceId) };
}

export async function schedulePublishing(user: AuthUser, workspaceId: string, rawInput: unknown) {
  const ctx = await resolveTenantContext(user, workspaceId);
  requireRole(ctx, ["owner", "editor"]);
  const input = parseOrThrow(schedulePublishSchema.safeParse(rawInput), "Invalid publishing payload");

  try {
    return await withTransaction(async (client) => {
      const found = await repo.getArtifactForPublishing(client, workspaceId, input.artifact_id);
      if (!found) throw new AppError(404, "NOT_FOUND", "Artifact not found in this workspace");
      const { artifact, approval } = found;
      if (
        !approval ||
        approval.status !== "approved" ||
        approval.target_version !== artifact.version ||
        approval.target_hash !== artifact.content_hash
      ) {
        throw new AppError(409, "APPROVAL_REQUIRED", "Only the exact approved version of an artifact can be scheduled");
      }

      const channel = await repo.getChannel(client, workspaceId, input.channel_id);
      if (!channel) throw new AppError(422, "INVALID_CHANNEL_REF", "Channel does not exist in this workspace");

      const contentId = await repo.upsertContentForArtifact(client, workspaceId, artifact, approval.actor_id);
      const mode = publishMode(workspaceId, channel.platform_name);
      const utmUrl = buildUtmUrl(
        await repo.getWebsiteUrl(client, workspaceId),
        channel.platform_name,
        input.utm_campaign ?? "aigrowthos",
        artifact.id
      );

      const job = await client.query<{ id: string }>(
        `INSERT INTO publishing_jobs (content_id, channel_id, scheduled_for, status, utm_url, workspace_id,
           artifact_id, approval_id, mode, created_by)
         VALUES ($1, $2, $3, 'scheduled', $4, $5, $6, $7, $8, $9) RETURNING id`,
        [contentId, channel.id, input.scheduled_for ?? new Date().toISOString(), utmUrl, workspaceId, artifact.id,
         approval.id, mode, user.id]
      );
      const jobId = job.rows[0].id;
      await repo.insertOutbox(client, workspaceId, "publishing.scheduled", `publish:${jobId}`, {
        job_id: jobId,
        artifact_id: artifact.id,
        approval_id: approval.id,
        channel_id: channel.id,
        mode,
      });
      await repo.insertAudit(client, workspaceId, user.id, "publishing.scheduled", jobId, {
        artifact_id: artifact.id,
        artifact_version: artifact.version,
        channel_id: channel.id,
        mode,
      });
      return repo.getJobView(client, workspaceId, jobId);
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new AppError(409, "ALREADY_SCHEDULED", "This artifact is already scheduled on this channel");
    }
    throw err;
  }
}

export async function updatePublishingJob(user: AuthUser, workspaceId: string, jobId: string, rawInput: unknown) {
  const ctx = await resolveTenantContext(user, workspaceId);
  requireRole(ctx, ["owner", "editor"]);
  const input = parseOrThrow(updatePublishingJobSchema.safeParse(rawInput), "Invalid publishing job update");

  return withTransaction(async (client) => {
    const job = await repo.getJob(client, workspaceId, jobId, true);
    if (!job) throw new AppError(404, "NOT_FOUND", "Publishing job not found");
    if (!["scheduled", "publishing"].includes(job.status)) {
      throw new AppError(409, "INVALID_STATE_TRANSITION", `Job is already ${job.status}`);
    }

    if (input.action === "cancel") {
      await client.query(`UPDATE publishing_jobs SET status = 'cancelled' WHERE id = $1`, [jobId]);
    } else {
      await client.query(
        `UPDATE publishing_jobs SET status = 'published', published_at = NOW(), external_post_id = $2 WHERE id = $1`,
        [jobId, input.external_post_id ?? null]
      );
      await client.query(`UPDATE contents SET status = 'published', published_at = NOW() WHERE id = $1`, [job.content_id]);
    }
    await repo.insertAudit(client, workspaceId, user.id, `publishing.${input.action}`, jobId, {
      from_status: job.status,
    });
    return repo.getJobView(client, workspaceId, jobId);
  });
}
