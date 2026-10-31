import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import { handleApiError } from '@/lib/errors';
import pool from '@/lib/db';
import { CommunityService } from '@/modules/community/service';

export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const actor = authenticateUser(req);
    const tenant = await resolveTenantContext(actor, params.workspace_id);
    requireRole(tenant, ['owner', 'editor', 'viewer']);

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status') || undefined;
    const platform = searchParams.get('platform') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const service = new CommunityService(pool);
    const messages = await service.listMessages(params.workspace_id, { status, platform, limit });
    return NextResponse.json({ messages });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const actor = authenticateUser(req);
    const tenant = await resolveTenantContext(actor, params.workspace_id);
    requireRole(tenant, ['owner', 'editor']);

    const body = await req.json().catch(() => null);
    const service = new CommunityService(pool);
    const result = await service.receiveMessage(params.workspace_id, actor.id, body);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
