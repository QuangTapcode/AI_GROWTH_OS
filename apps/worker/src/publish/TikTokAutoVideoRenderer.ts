import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { findTopicVideo } from './ReelOutboxRunner';
import { defaultTikTokUploadRoot } from './TikTokPublisher';

export interface AutoTikTokVideoInput {
  workspaceId: string;
  jobId: string;
  title?: string | null;
  hook?: string | null;
  cta?: string | null;
  imageUrl?: string | null;
  sourceId?: string | null;
}

export function extractSourceIdFromEvidence(evidence: unknown): string | null {
  if (!Array.isArray(evidence)) return null;
  for (const item of evidence) {
    if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).source_id === 'string') {
      const sid = String((item as Record<string, unknown>).source_id).trim();
      if (sid) return sid;
    }
  }
  return null;
}

export async function ensureAutoTikTokVideo(
  input: AutoTikTokVideoInput,
  options?: {
    uploadRoot?: string;
    communityVideoDir?: string | null;
    pythonExecutable?: string;
    scriptPath?: string;
  }
): Promise<string> {
  // 1. Reuse pre-rendered topic video from COMMUNITY_VIDEO_DIR/manifest.json if available
  const communityDir =
    options?.communityVideoDir !== undefined
      ? options.communityVideoDir
      : process.env.COMMUNITY_VIDEO_DIR?.trim() || null;
  if (communityDir && input.sourceId) {
    const topicVideo = findTopicVideo(communityDir, input.workspaceId, input.sourceId);
    if (topicVideo && fs.existsSync(topicVideo)) {
      return topicVideo;
    }
  }

  // 2. Reuse existing auto-rendered MP4 for this job if already built (idempotent retries)
  const uploadRoot = options?.uploadRoot ?? defaultTikTokUploadRoot();
  const safeWorkspace = input.workspaceId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeJob = input.jobId.replace(/[^a-zA-Z0-9_-]/g, '');
  const outDir = path.join(uploadRoot, safeWorkspace);
  const outPath = path.join(outDir, `auto-${safeJob}.mp4`);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
    return outPath;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const pythonExe = options?.pythonExecutable ?? (process.env.PYTHON_BIN?.trim() || 'python');
  const scriptPath = options?.scriptPath ?? path.resolve(__dirname, 'render_tiktok_video.py');
  const payload = JSON.stringify({
    output_path: outPath,
    title: input.title ?? '',
    hook: input.hook ?? '',
    cta: input.cta ?? '',
    image_url: input.imageUrl ?? null,
  });

  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      pythonExe,
      [scriptPath],
      { timeout: 60_000, maxBuffer: 1024 * 1024, windowsHide: true },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`Auto TikTok video render failed: ${stderr?.trim() || error.message}`));
          return;
        }
        resolve();
      }
    );
    child.stdin?.end(payload);
  });

  if (!fs.existsSync(outPath) || fs.statSync(outPath).size <= 0) {
    throw new Error(`Auto TikTok video render produced no file at ${outPath}`);
  }
  return outPath;
}

