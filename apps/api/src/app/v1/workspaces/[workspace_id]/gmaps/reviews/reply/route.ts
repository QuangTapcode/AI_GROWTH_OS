import { NextRequest, NextResponse } from 'next/server';
import { GoogleMapsSpecialistService } from '../../../../../../../modules/gmaps/specialist';

export async function POST(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const body = await request.json();
    const { review_id, reply_text } = body;
    if (!review_id) {
      return NextResponse.json({ ok: false, error: 'review_id is required' }, { status: 400 });
    }

    const service = new GoogleMapsSpecialistService();
    const updated = await service.replyToReview(params.workspace_id, review_id, reply_text);
    return NextResponse.json({ ok: true, item: updated });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to reply to review' }, { status: 500 });
  }
}

