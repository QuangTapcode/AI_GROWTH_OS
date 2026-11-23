import { NextRequest, NextResponse } from 'next/server';
import { GoogleMapsSpecialistService } from '../../../../../../modules/gmaps/specialist';

export async function POST(
  _request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const service = new GoogleMapsSpecialistService();
    const result = await service.syncAndAutoReplyAllReviews(params.workspace_id);
    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to sync Google Maps reviews' }, { status: 500 });
  }
}

