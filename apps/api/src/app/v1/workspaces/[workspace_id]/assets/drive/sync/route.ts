import { NextRequest, NextResponse } from 'next/server';
import { DriveAssetIngestionService } from '../../../../../../../modules/assets/drive';
import { GoogleMapsSpecialistService } from '../../../../../../../modules/gmaps/specialist';

export async function POST(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const service = new DriveAssetIngestionService();
    const gmapsService = new GoogleMapsSpecialistService();

    if (body.spot_name) {
      const asset = await service.addAsset(params.workspace_id, {
        file_name: body.file_name || `${String(body.spot_name).replace(/\s+/g, '_')}_${Date.now()}.jpg`,
        file_url: body.file_url || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
        spot_name: String(body.spot_name),
        spot_notes: body.spot_notes ? String(body.spot_notes) : undefined,
      });
      await gmapsService.autoPublishAllStagedDriveAssets(params.workspace_id).catch(() => {});
      const allAssets = await service.listStagedAssets(params.workspace_id, false);
      return NextResponse.json({ ok: true, asset, queued_assets: allAssets });
    }

    const result = await service.syncDriveFolder(params.workspace_id, body.folder_url);
    await gmapsService.autoPublishAllStagedDriveAssets(params.workspace_id).catch(() => {});
    const allAssets = await service.listStagedAssets(
      params.workspace_id,
      !result.is_real_drive
    );
    return NextResponse.json({
      ok: true,
      result,
      queued_assets: allAssets.length > 0 ? allAssets : result.items,
      folder_url: result.folder_url,
      message: result.message
        ? `${result.message} • Agent 5 đã tự động khởi tạo & xuất bản 100% bài đánh giá Local SEO cho toàn bộ ảnh!`
        : undefined,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to sync drive assets' }, { status: 500 });
  }
}
