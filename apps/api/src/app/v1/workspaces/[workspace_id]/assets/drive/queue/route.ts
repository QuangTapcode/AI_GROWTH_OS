import { NextRequest, NextResponse } from 'next/server';
import { DriveAssetIngestionService } from '../../../../../../../modules/assets/drive';

export async function GET(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const allowSeed = request.nextUrl.searchParams.get('seed') !== 'false';
    const service = new DriveAssetIngestionService();
    const [assets, folderUrl] = await Promise.all([
      service.listStagedAssets(params.workspace_id, allowSeed),
      service.getConfiguredDriveUrl(params.workspace_id),
    ]);
    return NextResponse.json({ ok: true, assets, folder_url: folderUrl });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to list drive assets' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const body = await request.json();
    const { file_name, file_url, spot_name, spot_notes } = body;

    if (!spot_name) {
      return NextResponse.json({ ok: false, error: 'spot_name is required' }, { status: 400 });
    }

    const service = new DriveAssetIngestionService();
    const created = await service.addAsset(params.workspace_id, {
      file_name: file_name || `${spot_name.replace(/\s+/g, '_')}_${Date.now()}.jpg`,
      file_url: file_url || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
      spot_name,
      spot_notes,
    });

    return NextResponse.json({ ok: true, asset: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to upload drive asset' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const service = new DriveAssetIngestionService();
    const deleted = await service.clearMockAssets(params.workspace_id);
    const remaining = await service.listStagedAssets(params.workspace_id, false);
    return NextResponse.json({ ok: true, deleted_count: deleted, assets: remaining });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to clear mock assets' }, { status: 500 });
  }
}
