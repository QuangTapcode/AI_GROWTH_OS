import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { authenticateUser } from '@/lib/auth';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import { handleApiError } from '@/lib/errors';
import { syncFacebookCounters, verifyFacebookConnection } from '@/modules/performance/social';
import { facebookHistoryReport } from '@/modules/performance/socialReport';

export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    return NextResponse.json(await facebookHistoryReport(pool,tenant.workspaceId,{
      from: req.nextUrl.searchParams.get('from'), to: req.nextUrl.searchParams.get('to'),
    }));
  } catch (error) { return handleApiError(error); }
}

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    requireRole(tenant, ['owner', 'editor']);
    const body=await req.json();
    if(body?.action==='verify') {
      requireRole(tenant,['owner']);
      return NextResponse.json(await verifyFacebookConnection(pool,tenant.workspaceId));
    }
    return NextResponse.json(await syncFacebookCounters(pool, tenant.workspaceId, body));
  } catch (error) { return handleApiError(error); }
}
