import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pool from '../../../../../../lib/db';
import { GoogleMapsSpecialistService } from '../../../../../../modules/gmaps/specialist';

function resolveWorkerDir(): string {
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

function runGMapsBotScript(args: string[], timeoutMs = 150_000): Promise<Record<string, any>> {
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

export async function GET() {
  try {
    const res = await runGMapsBotScript(['check'], 15_000);
    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to check Google Maps bot' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'post-review';
    const wsId = params.workspace_id;

    if (action === 'login') {
      const loginRes = await runGMapsBotScript(['login'], 130_000);
      return NextResponse.json(loginRes);
    }

    if (action === 'auto-publish-all') {
      const service = new GoogleMapsSpecialistService();
      const batchResult = await service.autoPublishAllStagedDriveAssets(wsId);
      return NextResponse.json({ ok: true, ...batchResult });
    }

    // Default: post-review onto real Google Maps using Playwright browser bot
    const service = new GoogleMapsSpecialistService();
    let spotName = body.spot_name || '';
    let reviewText = body.review_text || '';
    let imageUrl = body.image_url || '';
    let driveFileId = body.drive_file_id || '';
    let placeQuery = body.place_query || '';
    let targetPostId: string | undefined = body.post_id ? String(body.post_id) : undefined;

    if (body.asset_id) {
      const existingPost = await pool.query(
        `SELECT * FROM gmaps_reputation
         WHERE workspace_id = $1::uuid AND item_type = 'local_post' AND metadata->>'asset_id' = $2::text
         ORDER BY created_at DESC LIMIT 1`,
        [wsId, String(body.asset_id)]
      );
      if (existingPost.rows.length > 0) {
        const row = existingPost.rows[0];
        targetPostId = row.id;
        spotName = spotName || row.metadata?.spot_name || 'Bà Nà Hills Đà Nẵng';
        reviewText = reviewText || row.content;
        imageUrl = imageUrl || row.metadata?.image_url || '';
        driveFileId = driveFileId || row.metadata?.drive_file_id || '';
        placeQuery = placeQuery || row.metadata?.maps_query || '';
      } else {
        const post = await service.publishPostFromDriveAsset(wsId, body.asset_id);
        if (post) {
          targetPostId = post.id;
          spotName = spotName || post.metadata?.spot_name || 'Bà Nà Hills Đà Nẵng';
          reviewText = reviewText || post.content;
          imageUrl = imageUrl || post.metadata?.image_url || '';
          driveFileId = driveFileId || post.metadata?.drive_file_id || '';
          placeQuery = placeQuery || post.metadata?.maps_query || '';
        }
      }
    } else if (body.post_id) {
      const postRes = await pool.query(
        `SELECT * FROM gmaps_reputation WHERE workspace_id = $1::uuid AND id = $2::uuid LIMIT 1`,
        [wsId, body.post_id]
      );
      if (postRes.rows.length > 0) {
        const row = postRes.rows[0];
        targetPostId = row.id;
        spotName = spotName || row.metadata?.spot_name || 'Bà Nà Hills Đà Nẵng';
        reviewText = reviewText || row.content;
        imageUrl = imageUrl || row.metadata?.image_url || '';
        driveFileId = driveFileId || row.metadata?.drive_file_id || '';
        placeQuery = placeQuery || row.metadata?.maps_query || '';
      }
    } else {
      // Fall back to matching spot or the first local_post in gmaps_reputation
      const firstPostRes = spotName
        ? await pool.query(
            `SELECT * FROM gmaps_reputation
             WHERE workspace_id = $1::uuid AND item_type = 'local_post'
             ORDER BY CASE WHEN metadata->>'spot_name' ILIKE $2 THEN 0 ELSE 1 END, created_at DESC
             LIMIT 1`,
            [wsId, `%${spotName}%`]
          )
        : await pool.query(
            `SELECT * FROM gmaps_reputation
             WHERE workspace_id = $1::uuid AND item_type = 'local_post'
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
      reviewText = `📍 Trải nghiệm thực tế tuyệt vời tại ${spotName}! Cảnh quan đẹp, không gian ấn tượng và rất đáng để ghé thăm khi du lịch Đà Nẵng - Hội An.`;
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

    // Only mark as posted when the bot actually clicked "Đăng" on Google Maps.
    if (targetPostId && botResult?.submitted === true) {
      try {
        const metaPatch = {
          real_bot_posted: true,
          real_posted_at: new Date().toISOString(),
          real_place_url: botResult.placeUrl || null,
          contributions_url: contributionsUrl,
          bot_submitted: Boolean(botResult.submitted),
        };
        const upd = await pool.query(
          `UPDATE gmaps_reputation
           SET metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
           WHERE workspace_id = $1::uuid AND id = $2::uuid
           RETURNING *`,
          [wsId, targetPostId, JSON.stringify(metaPatch)]
        );
        updatedPost = upd.rows[0] || null;
      } catch {
        // Ignore metadata update error if row missing
      }
    }

    return NextResponse.json({
      ...botResult,
      spot_name: spotName,
      place_query: placeQuery,
      post_id: targetPostId,
      contributions_url: contributionsUrl,
      updated_post: updatedPost,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to run Google Maps bot' }, { status: 500 });
  }
}

