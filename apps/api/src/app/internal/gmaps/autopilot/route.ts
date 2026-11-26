import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { DriveAssetIngestionService, extractGoogleDriveTarget } from '@/modules/assets/drive';
import { checkGMapsBotSessionFast, publishGMapsPostWithBot } from '@/modules/gmaps/botRunner';
import { GoogleMapsSpecialistService } from '@/modules/gmaps/specialist';

let gmapsAutopilotInProgress = false;

export async function POST(req: NextRequest) {
  const token = process.env.AUTOMATION_INTERNAL_TOKEN;
  const actual = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  if (
    !token ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }

  if (gmapsAutopilotInProgress) {
    return NextResponse.json({ ok: true, results: [], skipped: 'in_progress' });
  }

  gmapsAutopilotInProgress = true;
  try {
    const rows = (
      await pool.query(
        `SELECT workspace_id, gdrive_url
         FROM merchant_onboarding
         WHERE gdrive_url IS NOT NULL
           AND TRIM(gdrive_url) <> ''
           AND gdrive_url NOT LIKE '%tripc-vietnam-playbook-assets%'
         ORDER BY updated_at DESC
         LIMIT 25`
      )
    ).rows;

    const driveService = new DriveAssetIngestionService(pool);
    const gmapsService = new GoogleMapsSpecialistService(pool);
    const botSession = checkGMapsBotSessionFast();
    const results: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      const target = extractGoogleDriveTarget(row.gdrive_url);
      if (target.kind === 'none') continue;
      try {
        // 1. Incremental Google Drive scan (automatically detects any new photos uploaded to Google Drive)
        const syncRes = await driveService.syncDriveFolder(row.workspace_id, row.gdrive_url);
        // 2. Automatic Agent writing (automatically drafts Google Maps posts for any new photos)
        const publishRes = await gmapsService.autoPublishAllStagedDriveAssets(row.workspace_id);
        // 3. Automatic Google Maps publishing via Playwright Bot (no manual approval needed)
        let botPostRes: Record<string, any> | null = null;
        if (botSession.isLoggedIn) {
          botPostRes = await publishGMapsPostWithBot(row.workspace_id);
        }
        results.push({
          workspace_id: row.workspace_id,
          assets_scanned: syncRes.assets_scanned,
          truly_new_assets: syncRes.truly_new_assets ?? 0,
          newly_drafted_posts: publishRes.newly_created_count ?? 0,
          total_posts_checked: publishRes.auto_published_count,
          auto_bot_published: Boolean(botPostRes?.submitted),
          auto_bot_post_id: botPostRes?.post_id ?? null,
          auto_bot_spot: botPostRes?.spot_name ?? null,
        });
      } catch (err: any) {
        results.push({
          workspace_id: row.workspace_id,
          error: err?.message || 'gmaps_drive_autopilot_failed',
        });
      }
    }

    return NextResponse.json({ ok: true, results });
  } finally {
    gmapsAutopilotInProgress = false;
  }
}
