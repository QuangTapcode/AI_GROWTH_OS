import { NextRequest, NextResponse } from 'next/server';
import { GoogleMapsSpecialistService } from '../../../../../../modules/gmaps/specialist';

export async function GET(
  _request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const service = new GoogleMapsSpecialistService();
    const posts = await service.listItems(params.workspace_id, 'local_post');
    return NextResponse.json({ ok: true, posts });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to list local posts' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const body = await request.json();
    const { content, image_url, asset_id } = body;

    const service = new GoogleMapsSpecialistService();

    if (asset_id) {
      const created = await service.publishPostFromDriveAsset(params.workspace_id, asset_id);
      if (!created) {
        return NextResponse.json({ ok: false, error: 'Asset not found or failed to generate' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, post: created }, { status: 201 });
    }

    if (!content) {
      return NextResponse.json({ ok: false, error: 'content or asset_id is required' }, { status: 400 });
    }

    const created = await service.createLocalPost(params.workspace_id, content, image_url);
    return NextResponse.json({ ok: true, post: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to create local post' },
      { status: 500 }
    );
  }
}
