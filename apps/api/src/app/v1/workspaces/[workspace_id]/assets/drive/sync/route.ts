import { NextRequest, NextResponse } from 'next/server';
import { DriveAssetIngestionService } from '../../../../../../../modules/assets/drive';

export async function POST(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const service = new DriveAssetIngestionService();
    const result = await service.syncDriveFolder(params.workspace_id, body.folder_url);
    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to sync drive assets' }, { status: 500 });
  }
}

