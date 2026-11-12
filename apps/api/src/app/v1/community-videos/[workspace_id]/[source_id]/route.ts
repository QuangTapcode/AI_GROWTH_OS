import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { AppError, handleApiError } from '@/lib/errors';
import { parseRange, readVideoManifest, verifyVideoRequest, videoDir } from '@/modules/community/videos';

export const dynamic = 'force-dynamic';

type Params = { params: { workspace_id: string; source_id: string } };

/**
 * Plays a Community topic's explainer video. The link comes signed from the hub (a <video> element cannot send
 * the Bearer header), so the signature is the authorisation: it names one workspace, one topic and an expiry.
 */
export async function GET(req: Request, { params }: Params) {
  try {
    const url = new URL(req.url);
    if (!verifyVideoRequest(params.workspace_id, params.source_id, url.searchParams.get('exp'), url.searchParams.get('sig'))) {
      throw new AppError(403, 'VIDEO_LINK_INVALID', 'This video link is invalid or has expired. Reload the Community page.');
    }
    const dir = videoDir();
    const video = readVideoManifest(dir, params.workspace_id).get(params.source_id);
    if (!dir || !video) throw new AppError(404, 'VIDEO_NOT_FOUND', 'This topic has no video.');

    const file = path.join(dir, video.file);
    const size = statSync(file).size;
    const headers: Record<string, string> = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    };
    if (url.searchParams.get('download') === '1') {
      headers['Content-Disposition'] = `attachment; filename="${video.file}"`;
    }

    const range = parseRange(req.headers.get('range'), size);
    if (range === 'unsatisfiable') {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    }
    const { start, end } = range ?? { start: 0, end: size - 1 };
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    headers['Content-Length'] = String(end - start + 1);
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    return new Response(body, { status: range ? 206 : 200, headers });
  } catch (error) {
    return handleApiError(error);
  }
}
