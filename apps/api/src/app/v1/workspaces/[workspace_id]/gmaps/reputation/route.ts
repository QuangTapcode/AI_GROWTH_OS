import { NextRequest, NextResponse } from 'next/server';
import { GoogleMapsSpecialistService } from '../../../../../../modules/gmaps/specialist';

export async function GET(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const service = new GoogleMapsSpecialistService();
    const [overview, items, agentArtifacts] = await Promise.all([
      service.getOverview(params.workspace_id),
      service.listItems(params.workspace_id),
      service.listExistingAgentArtifacts(params.workspace_id, 30),
    ]);
    return NextResponse.json({ ok: true, overview, items, agent_artifacts: agentArtifacts });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to fetch Google Maps reputation' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const service = new GoogleMapsSpecialistService();

    if (body.action === 'rewrite_with_agent') {
      const result = await service.rewritePostsWithExistingAgents(params.workspace_id, {
        postId: body.post_id,
        sourceArtifactId: body.source_artifact_id,
        rewriteAllTemplates: Boolean(body.rewrite_all_templates),
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === 'create_from_agent_artifact' && body.source_artifact_id) {
      const post = await service.createPostFromExistingAgentArtifact(params.workspace_id, {
        sourceArtifactId: String(body.source_artifact_id),
        assetId: body.asset_id ? String(body.asset_id) : undefined,
        spotName: body.spot_name ? String(body.spot_name) : undefined,
      });
      if (!post) {
        return NextResponse.json({ ok: false, error: 'Không tìm thấy bài viết gốc từ Agent.' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, post });
    }

    return NextResponse.json({ ok: false, error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to process agent action' },
      { status: 500 }
    );
  }
}

