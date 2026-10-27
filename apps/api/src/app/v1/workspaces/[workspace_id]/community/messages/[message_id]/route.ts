import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import { handleApiError } from '@/lib/errors';
import pool from '@/lib/db';
import { CommunityService } from '@/modules/community/service';

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string; message_id: string } },
) {
  try {
    const actor = authenticateUser(req);
    const tenant = await resolveTenantContext(actor, params.workspace_id);
    requireRole(tenant, ['owner', 'editor', 'viewer']);

    const service = new CommunityService(pool);
    const message = await service.getMessage(params.workspace_id, params.message_id);
    return NextResponse.json({ message });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { workspace_id: string; message_id: string } },
) {
  try {
    const actor = authenticateUser(req);
    const tenant = await resolveTenantContext(actor, params.workspace_id);
    requireRole(tenant, ['owner', 'editor']);

    const body = await req.json().catch(() => null);
    const service = new CommunityService(pool);
    const message = await service.updateMessageStatus(
      params.workspace_id,
      params.message_id,
      body,
    );
    return NextResponse.json({ message });
  } catch (error) {
    return handleApiError(error);
  }
}
