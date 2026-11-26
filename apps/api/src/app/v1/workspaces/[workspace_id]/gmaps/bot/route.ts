import { NextRequest, NextResponse } from 'next/server';
import {
  checkGMapsBotSessionFast,
  publishGMapsPostWithBot,
  runGMapsBotScript,
} from '../../../../../../modules/gmaps/botRunner';
import { GoogleMapsSpecialistService } from '../../../../../../modules/gmaps/specialist';

export async function GET() {
  try {
    const res = checkGMapsBotSessionFast();
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
      const session = checkGMapsBotSessionFast();
      let botPublishResult: Record<string, any> | null = null;
      if (session.isLoggedIn) {
        botPublishResult = await publishGMapsPostWithBot(wsId);
      }
      return NextResponse.json({ ok: true, ...batchResult, bot_publish: botPublishResult });
    }

    const result = await publishGMapsPostWithBot(wsId, {
      asset_id: body.asset_id,
      post_id: body.post_id,
      spot_name: body.spot_name,
      review_text: body.review_text,
      image_url: body.image_url,
      drive_file_id: body.drive_file_id,
      place_query: body.place_query,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to run Google Maps bot' }, { status: 500 });
  }
}
