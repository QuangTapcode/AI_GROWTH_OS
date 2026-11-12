import { readFileSync, statSync } from 'node:fs';
import { FacebookPagePublisher } from './FacebookPagePublisher';

/**
 * Publishes a local MP4 as a Facebook Page Reel (Graph API /{page_id}/video_reels):
 * 1. upload_phase=start  -> video_id + upload_url
 * 2. POST the bytes to upload_url (Authorization: OAuth <page token>, offset, file_size)
 * 3. upload_phase=finish with video_state=PUBLISHED and the description
 * A Page token with pages_manage_posts, pages_read_engagement and pages_show_list is required.
 */
export type ReelResult =
  | { success: true; videoId: string; postUrl: string }
  | { success: false; permanent: boolean; errorCode: string; errorMessage: string };

const PERMISSION_CODES = new Set([10, 190, 200]);
const TIMEOUT_MS = () => Number(process.env.FACEBOOK_REEL_TIMEOUT_MS || 120000);

export class FacebookReelPublisher {
  private readonly graphVersion: string;

  constructor(
    private readonly pageId: string,
    private readonly accessToken: string,
    graphVersion = process.env.FACEBOOK_GRAPH_API_VERSION || 'v21.0',
  ) {
    this.graphVersion = FacebookPagePublisher.validateAndNormalizeVersion(graphVersion);
  }

  private endpoint() {
    return `https://graph.facebook.com/${this.graphVersion}/${this.pageId}/video_reels`;
  }

  private form(fields: Record<string, string>) {
    const body = new URLSearchParams({ ...fields, access_token: this.accessToken });
    return { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(30000) };
  }

  async publishReel({ filePath, description }: { filePath: string; description: string }): Promise<ReelResult> {
    try {
      const start = await fetch(this.endpoint(), this.form({ upload_phase: 'start' }));
      const started = await readJson(start);
      if (!start.ok || typeof started?.video_id !== 'string' || typeof started?.upload_url !== 'string') {
        return failure('FACEBOOK_REEL_START_FAILED', start.status, started);
      }
      const videoId: string = started.video_id;

      const bytes = readFileSync(filePath);
      const upload = await fetch(started.upload_url, {
        method: 'POST',
        headers: { Authorization: `OAuth ${this.accessToken}`, offset: '0', file_size: String(statSync(filePath).size) },
        body: bytes,
        signal: AbortSignal.timeout(TIMEOUT_MS()),
      });
      const uploaded = await readJson(upload);
      if (!upload.ok || uploaded?.success !== true) return failure('FACEBOOK_REEL_UPLOAD_FAILED', upload.status, uploaded);

      const finish = await fetch(this.endpoint(), this.form({
        upload_phase: 'finish', video_id: videoId, video_state: 'PUBLISHED', description,
      }));
      const finished = await readJson(finish);
      if (!finish.ok || finished?.success !== true) return failure('FACEBOOK_REEL_FINISH_FAILED', finish.status, finished);

      return { success: true, videoId, postUrl: `https://www.facebook.com/reel/${videoId}` };
    } catch (error) {
      return { success: false, permanent: false, errorCode: 'FACEBOOK_REEL_UNKNOWN_OUTCOME', errorMessage: error instanceof Error ? error.message : 'Reel request failed' };
    }
  }
}

function failure(code: string, status: number, payload: any): ReelResult {
  const providerCode = Number(payload?.error?.code);
  const permission = status === 401 || status === 403 || PERMISSION_CODES.has(providerCode);
  const message = String(payload?.error?.message ?? payload?.debug_info?.message ?? `HTTP ${status}`).slice(0, 300);
  return permission
    ? { success: false, permanent: true, errorCode: 'FACEBOOK_REEL_PERMISSION_DENIED', errorMessage: message }
    : { success: false, permanent: status >= 400 && status < 500, errorCode: code, errorMessage: message };
}

async function readJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
