import { NextRequest, NextResponse } from 'next/server';
import { ZeroTechOnboardingService } from '../../../../../modules/onboarding/onboarding';

export async function GET(
  _request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const service = new ZeroTechOnboardingService();
    const state = await service.getStatus(params.workspace_id);
    return NextResponse.json({ ok: true, state });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to get onboarding state' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const body = await request.json();
    const { fanpage_url, gmaps_url, gdrive_url, community_group_url } = body;
    if (!fanpage_url || !gmaps_url || !gdrive_url) {
      return NextResponse.json(
        { ok: false, error: 'fanpage_url, gmaps_url, và gdrive_url là bắt buộc' },
        { status: 400 }
      );
    }

    const service = new ZeroTechOnboardingService();
    const state = await service.submitLinks(params.workspace_id, {
      fanpage_url,
      gmaps_url,
      gdrive_url,
      community_group_url,
    });
    return NextResponse.json({ ok: true, state });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to submit onboarding' }, { status: 500 });
  }
}
