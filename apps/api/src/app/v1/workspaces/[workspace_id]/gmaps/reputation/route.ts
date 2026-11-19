import { NextRequest, NextResponse } from 'next/server';
import { GoogleMapsSpecialistService } from '../../../../../../modules/gmaps/specialist';

export async function GET(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const service = new GoogleMapsSpecialistService();
    const overview = await service.getOverview(params.workspace_id);
    const items = await service.listItems(params.workspace_id);
    return NextResponse.json({ ok: true, overview, items });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to fetch Google Maps reputation' }, { status: 500 });
  }
}

