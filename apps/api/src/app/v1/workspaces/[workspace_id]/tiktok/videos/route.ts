import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";
import { requireRole, resolveTenantContext } from "@/lib/tenant";
import {
  createOptionBTikTokVideo,
  getTikTokConnectionSummary,
  listTikTokVideos,
  normalizeHashtags,
} from "@/modules/integrations/tiktok";

const uuidCheck = z.string().uuid();
const MAX_REQUEST_BYTES = 110 * 1024 * 1024; // 100 MB video + multipart overhead

function parseHashtagsInput(raw: unknown): string[] {
  if (Array.isArray(raw)) return normalizeHashtags(raw.map(String));
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) return normalizeHashtags(arr.map(String));
      } catch {
        // Fall through to delimiter parsing
      }
    }
    return normalizeHashtags(trimmed);
  }
  return [];
}

function parseAction(raw: unknown): "publish_now" | "schedule" | "save_draft" {
  if (raw === "schedule" || raw === "save_draft" || raw === "publish_now") return raw;
  return "publish_now";
}

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string } },
) {
  try {
    const user = authenticateUser(req);
    await resolveTenantContext(user, params.workspace_id);

    const [connection, items] = await Promise.all([
      getTikTokConnectionSummary(params.workspace_id),
      listTikTokVideos(params.workspace_id),
    ]);

    return NextResponse.json({ connection, items });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { workspace_id: string } },
) {
  try {
    const user = authenticateUser(req);
    const ctx = await resolveTenantContext(user, params.workspace_id);
    requireRole(ctx, ["owner", "editor"]);

    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_REQUEST_BYTES) {
      throw new AppError(413, "PAYLOAD_TOO_LARGE", "Kích thước request vượt quá giới hạn 100 MB.");
    }

    const contentType = (req.headers.get("content-type") || "").toLowerCase();

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const videoEntry = formData.get("video");
      const mediaUrlRaw = formData.get("media_url");
      const mediaUrl = typeof mediaUrlRaw === "string" && mediaUrlRaw.trim() ? mediaUrlRaw.trim() : null;
      const sourceArtifactRaw = formData.get("source_artifact_id");
      const sourceArtifactId =
        typeof sourceArtifactRaw === "string" && sourceArtifactRaw.trim()
          ? sourceArtifactRaw.trim()
          : null;

      if (sourceArtifactId && !uuidCheck.safeParse(sourceArtifactId).success) {
        throw new AppError(422, "VALIDATION_FAILED", "source_artifact_id không đúng định dạng UUID.");
      }

      const fileObj =
        videoEntry && typeof videoEntry === "object" && "arrayBuffer" in videoEntry
          ? (videoEntry as File)
          : null;

      if (fileObj && fileObj.size > 100 * 1024 * 1024) {
        throw new AppError(413, "VIDEO_TOO_LARGE", "Video vượt quá giới hạn 100 MB.");
      }

      const explicitSource = formData.get("video_source_type");
      const videoSourceType: "file_upload" | "url" =
        fileObj && fileObj.size > 0
          ? "file_upload"
          : explicitSource === "url" || Boolean(mediaUrl)
            ? "url"
            : "file_upload";

      const fileBuffer = fileObj && fileObj.size > 0 ? Buffer.from(await fileObj.arrayBuffer()) : undefined;
      const titleRaw = formData.get("title");
      const captionRaw = formData.get("caption");
      const hashtagsRaw = formData.get("hashtags");
      const privacyRaw = formData.get("privacy_level");
      const isAigcRaw = formData.get("is_aigc");
      const actionRaw = formData.get("action");
      const scheduledForRaw = formData.get("scheduled_for");

      const result = await createOptionBTikTokVideo({
        workspaceId: params.workspace_id,
        actorUserId: user.id,
        actorRole: ctx.role,
        title: typeof titleRaw === "string" ? titleRaw : null,
        caption: typeof captionRaw === "string" ? captionRaw : null,
        hashtags: parseHashtagsInput(hashtagsRaw),
        sourceArtifactId,
        videoSourceType,
        fileBuffer,
        fileName: fileObj?.name,
        mediaUrl,
        privacyLevel: typeof privacyRaw === "string" ? privacyRaw : null,
        isAigc: isAigcRaw !== "false",
        action: parseAction(actionRaw),
        scheduledFor: typeof scheduledForRaw === "string" && scheduledForRaw.trim() ? scheduledForRaw.trim() : null,
      });

      return NextResponse.json(result, { status: 201 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const sourceArtifactId =
      typeof body.source_artifact_id === "string" && body.source_artifact_id.trim()
        ? body.source_artifact_id.trim()
        : null;
    if (sourceArtifactId && !uuidCheck.safeParse(sourceArtifactId).success) {
      throw new AppError(422, "VALIDATION_FAILED", "source_artifact_id không đúng định dạng UUID.");
    }

    const result = await createOptionBTikTokVideo({
      workspaceId: params.workspace_id,
      actorUserId: user.id,
      actorRole: ctx.role,
      title: typeof body.title === "string" ? body.title : null,
      caption: typeof body.caption === "string" ? body.caption : null,
      hashtags: parseHashtagsInput(body.hashtags),
      sourceArtifactId,
      videoSourceType: "url",
      mediaUrl: typeof body.media_url === "string" ? body.media_url : null,
      privacyLevel: typeof body.privacy_level === "string" ? body.privacy_level : null,
      isAigc: body.is_aigc !== false,
      action: parseAction(body.action),
      scheduledFor: typeof body.scheduled_for === "string" && body.scheduled_for.trim() ? body.scheduled_for.trim() : null,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

