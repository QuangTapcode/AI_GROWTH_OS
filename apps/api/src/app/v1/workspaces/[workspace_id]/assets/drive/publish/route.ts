import { NextRequest, NextResponse } from 'next/server';
import { DriveAssetIngestionService } from '../../../../../../../modules/assets/drive';

export async function POST(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const body = await request.json();
    const { asset_id, channels } = body;
    if (!asset_id) {
      return NextResponse.json({ ok: false, error: 'asset_id is required' }, { status: 400 });
    }

    const service = new DriveAssetIngestionService();
    const updated = await service.publishAsset(params.workspace_id, asset_id, channels);
    return NextResponse.json({ ok: true, asset: updated });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to publish asset' }, { status: 500 });
  }
}

