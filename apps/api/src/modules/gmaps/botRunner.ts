import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pool from '../../lib/db';
import { GoogleMapsSpecialistService } from './specialist';

let isBotPublishingInProgress = false;

export function resolveWorkerDir(): string {
  const candidates = [
    path.resolve(process.cwd(), '../worker'),
    path.resolve(process.cwd(), 'apps/worker'),
    'F:/luu vao day di/Thuc_Tap/AI_GROWTH_OS/apps/worker',
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'src/publish/runGoogleMapsBot.ts'))) {
      return c;
    }
  }
  return candidates[0];
}

export function checkGMapsBotSessionFast(): {
  ok: boolean;
  isLoggedIn: boolean;
  sessionFile: string;
  updatedAt: string | null;
  detail: string;
} {
  const workerDir = resolveWorkerDir();
  const sessionFile = path.join(workerDir, '.gmaps-session.json');
  if (!fs.existsSync(sessionFile)) {
    return {
      ok: true,
      isLoggedIn: false,
      sessionFile,
      updatedAt: null,
      detail: 'Chưa đăng nhập tài khoản Google cho Bot. Bấm Bước 1 để đăng nhập Google 1 lần.',
    };
  }
  try {
    const stat = fs.statSync(sessionFile);
    const raw = JSON.parse(fs.readFileSync(sessionFile, 'utf8')) as {
      cookies?: Array<{ name?: string; value?: string; domain?: string }>;
    };
    const cookies = raw.cookies ?? [];
    const hasSid = cookies.some(
      (c) =>
        (c.domain || '').includes('google.com') &&
        (c.name === 'SID' || c.name === '__Secure-1PSID' || c.name === '__Secure-3PSID') &&
        Boolean(c.value)
    );
    return {
      ok: true,
      isLoggedIn: hasSid,
      sessionFile,
      updatedAt: stat.mtime.toISOString(),
      detail: hasSid
        ? 'Đã kết nối phiên Google Maps Bot (.gmaps-session.json). Agent 5 tự động quét Drive, viết bài và đăng đánh giá lên Google Maps.'
        : 'Chưa có cookie đăng nhập Google hợp lệ trong .gmaps-session.json.',
    };
  } catch {
    return {
      ok: true,
      isLoggedIn: false,
      sessionFile,
      updatedAt: null,
      detail: 'Không thể đọc file phiên .gmaps-session.json.',
    };
  }
}

export function runGMapsBotScript(args: string[], timeoutMs = 150_000): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    const workerDir = resolveWorkerDir();
    const tsxCli = path.join(workerDir, 'node_modules/tsx/dist/cli.mjs');
    const scriptPath = path.join(workerDir, 'src/publish/runGoogleMapsBot.ts');

    const child = spawn(process.execPath, [tsxCli, scriptPath, ...args], {
      cwd: workerDir,
      env: { ...process.env },
      windowsHide: false,
    });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        child.kill();
        resolve({
          ok: false,
          error: 'Timeout waiting for Google Maps browser bot',
          stdout,
          stderr,
        });
      }
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    child.on('close', () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      const lines = stdout.split(/\r?\n/);
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('GMAPS_BOT_RESULT:')) {
          try {
            const parsed = JSON.parse(line.slice('GMAPS_BOT_RESULT:'.length));
            resolve(parsed);
            return;
          } catch {
            // Fall through
          }
        }
      }
      resolve({ ok: false, stdout, stderr, detail: 'Không nhận được phản hồi JSON từ Google Maps Bot.' });
    });

    child.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
  });
}

export async function publishGMapsPostWithBot(
  wsId: string,
  options: {
    asset_id?: string;
    post_id?: string;
    spot_name?: string;
    review_text?: string;
    image_url?: string;
    drive_file_id?: string;
    place_query?: string;
  } = {}
): Promise<Record<string, any>> {
  if (isBotPublishingInProgress) {
    return {
      ok: false,
      busy: true,
      detail: 'Google Maps Bot đang xử lý đăng một bài khác trong nền, vui lòng chờ vài giây.',
    };
  }

  isBotPublishingInProgress = true;
  try {
    const service = new GoogleMapsSpecialistService();
    let spotName = options.spot_name || '';
    let reviewText = options.review_text || '';
    let imageUrl = options.image_url || '';
    let driveFileId = options.drive_file_id || '';
    let placeQuery = options.place_query || '';
    let targetPostId: string | undefined = options.post_id ? String(options.post_id) : undefined;

    if (options.asset_id) {
      const existingPost = await pool.query(
        `SELECT * FROM gmaps_reputation
         WHERE workspace_id = $1::uuid AND item_type = 'local_post' AND metadata->>'asset_id' = $2::text
         ORDER BY created_at DESC LIMIT 1`,
        [wsId, String(options.asset_id)]
      );
      if (existingPost.rows.length > 0) {
        const row = existingPost.rows[0];
        if (row.metadata?.real_bot_posted === true) {
          return {
            ok: false,
            already_posted: true,
            post_id: row.id,
            detail: 'Bài viết và tư liệu ảnh này đã được đăng thật lên Google Maps trước đó nên không cần đăng lại.',
          };
        }
        targetPostId = row.id;
        spotName = spotName || row.metadata?.spot_name || 'Bà Nà Hills Đà Nẵng';
        reviewText = reviewText || row.content;
        imageUrl = imageUrl || row.metadata?.image_url || '';
        driveFileId = driveFileId || row.metadata?.drive_file_id || '';
        placeQuery = placeQuery || row.metadata?.maps_query || '';
      } else {
        const post = await service.publishPostFromDriveAsset(wsId, options.asset_id);
        if (post) {
          targetPostId = post.id;
          spotName = spotName || post.metadata?.spot_name || 'Bà Nà Hills Đà Nẵng';
          reviewText = reviewText || post.content;
          imageUrl = imageUrl || post.metadata?.image_url || '';
          driveFileId = driveFileId || post.metadata?.drive_file_id || '';
          placeQuery = placeQuery || post.metadata?.maps_query || '';
        }
      }
    } else if (options.post_id) {
      const postRes = await pool.query(
        `SELECT * FROM gmaps_reputation WHERE workspace_id = $1::uuid AND id = $2::uuid LIMIT 1`,
        [wsId, options.post_id]
      );
      if (postRes.rows.length > 0) {
        const row = postRes.rows[0];
        if (row.metadata?.real_bot_posted === true) {
          return {
            ok: false,
            already_posted: true,
            post_id: row.id,
            detail: 'Bài viết này đã được đăng thật lên Google Maps trước đó nên không cần đăng lại.',
          };
        }
        targetPostId = row.id;
        spotName = spotName || row.metadata?.spot_name || 'Bà Nà Hills Đà Nẵng';
        reviewText = reviewText || row.content;
        imageUrl = imageUrl || row.metadata?.image_url || '';
        driveFileId = driveFileId || row.metadata?.drive_file_id || '';
        placeQuery = placeQuery || row.metadata?.maps_query || '';
      }
    } else {
      const firstPostRes = spotName
        ? await pool.query(
            `SELECT * FROM gmaps_reputation
             WHERE workspace_id = $1::uuid
               AND item_type = 'local_post'
               AND COALESCE((metadata->>'real_bot_posted')::boolean, false) = false
             ORDER BY CASE WHEN metadata->>'spot_name' ILIKE $2 THEN 0 ELSE 1 END, created_at DESC
             LIMIT 1`,
            [wsId, `%${spotName}%`]
          )
        : await pool.query(
            `SELECT * FROM gmaps_reputation
             WHERE workspace_id = $1::uuid
               AND item_type = 'local_post'
               AND COALESCE((metadata->>'real_bot_posted')::boolean, false) = false
             ORDER BY created_at DESC LIMIT 1`,
            [wsId]
          );
      if (firstPostRes.rows.length > 0) {
        const row = firstPostRes.rows[0];
        targetPostId = row.id;
        spotName = spotName || row.metadata?.spot_name || 'Bà Nà Hills Đà Nẵng';
        reviewText = reviewText || row.content;
        imageUrl = imageUrl || row.metadata?.image_url || '';
        driveFileId = driveFileId || row.metadata?.drive_file_id || '';
        placeQuery = placeQuery || row.metadata?.maps_query || '';
      } else {
        return {
          ok: false,
          already_posted: true,
          detail: 'Tất cả bài viết trong hàng chờ đều đã được đăng lên Google Maps.',
        };
      }
    }

    if (!spotName) {
      spotName = 'Bà Nà Hills Đà Nẵng';
    }

    if (!placeQuery) {
      const cleanBase = spotName
        .replace(/^\[[^\]]+\]\s*/, '')
        .replace(/\([^)]*\)/g, '')
        .split('—')[0]
        .trim();
      placeQuery = `${cleanBase}, Đà Nẵng - Hội An, Việt Nam`;
    }

    if (!reviewText) {
      reviewText = `Trải nghiệm thực tế tuyệt vời tại ${spotName}! Cảnh quan đẹp, không gian ấn tượng và rất đáng để ghé thăm khi du lịch Đà Nẵng - Hội An.`;
    }

    const tempPayloadPath = path.join(os.tmpdir(), `gmaps_bot_payload_${Date.now()}.json`);
    fs.writeFileSync(
      tempPayloadPath,
      JSON.stringify({
        placeQuery,
        spotName,
        reviewText,
        imageUrl,
        driveFileId,
        headless: true,
      }),
      'utf8'
    );

    const botResult = await runGMapsBotScript(['post-review', '--payload-file', tempPayloadPath], 180_000);
    const contributionsUrl = 'https://www.google.com/maps/contrib/';
    let updatedPost: Record<string, any> | null = null;

    if (targetPostId && botResult?.submitted === true) {
      try {
        const metaPatch: Record<string, any> = {
          real_bot_posted: true,
          published_to_maps: true,
          real_posted_at: new Date().toISOString(),
          real_place_url: botResult.placeUrl || null,
          contributions_url: contributionsUrl,
          bot_submitted: Boolean(botResult.submitted),
        };
        if (botResult.placeUrl && String(botResult.placeUrl).includes('/maps/place/')) {
          metaPatch.google_maps_url = botResult.placeUrl;
        }
        const upd = await pool.query(
          `UPDATE gmaps_reputation
           SET status = 'replied',
               metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
           WHERE workspace_id = $1::uuid AND id = $2::uuid
           RETURNING *`,
          [wsId, targetPostId, JSON.stringify(metaPatch)]
        );
        updatedPost = upd.rows[0] || null;
        const linkedAssetId = updatedPost?.metadata?.asset_id || options.asset_id || null;
        const linkedDriveFileId = updatedPost?.metadata?.drive_file_id || driveFileId || null;
        if (linkedAssetId || linkedDriveFileId) {
          await pool.query(
            `UPDATE drive_asset_queue
             SET status = 'published',
                 updated_at = NOW()
             WHERE workspace_id = $1::uuid
               AND (($2::text IS NOT NULL AND id::text = $2::text)
                 OR ($3::text IS NOT NULL AND drive_file_id = $3::text))`,
            [wsId, linkedAssetId ? String(linkedAssetId) : null, linkedDriveFileId ? String(linkedDriveFileId) : null]
          );
        }
      } catch {
        // Ignore metadata update error
      }
    }

    return {
      ...botResult,
      spot_name: spotName,
      place_query: placeQuery,
      post_id: targetPostId,
      contributions_url: contributionsUrl,
      updated_post: updatedPost,
    };
  } finally {
    isBotPublishingInProgress = false;
  }
}

