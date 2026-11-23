import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { authenticateUser } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import { approvePerformanceAction } from '@/modules/performance/actions';
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const user = authenticateUser(req), tenant = await resolveTenantContext(user, params.workspace_id);
    requireRole(tenant, ['owner']);
    return NextResponse.json(await approvePerformanceAction(pool, tenant.workspaceId, user.id, await req.json()));
  } catch (error) { return handleApiError(error); }
}
