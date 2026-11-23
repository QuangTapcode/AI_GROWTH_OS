import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import { AppError, handleApiError } from '@/lib/errors';
import pool from '@/lib/db';
import { DiscoveryError, defaultSearch, latestDiscovery, runDiscovery } from '@/modules/research/discovery';



export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    return NextResponse.json(await latestDiscovery(pool, tenant.workspaceId), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return handleApiError(error); }
}

/** Search the web for the profile's topics; queue open/official pages for ingest and owner review. */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    requireRole(tenant, ['owner', 'editor']);
    const body = await req.json().catch(() => ({})) as { topic?: unknown };
    if (body?.topic != null && (typeof body.topic !== 'string' || body.topic.length > 200)) {
      throw new AppError(400, 'INVALID_TOPIC', 'topic must be a string of at most 200 characters');
    }
    const result = await runDiscovery(pool, tenant.workspaceId, defaultSearch(), { topic: body?.topic as string | undefined });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DiscoveryError) return handleApiError(new AppError(error.status, error.code, error.message));
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'TypeError')) {
      return handleApiError(new AppError(502, 'SEARCH_UNAVAILABLE', 'Search service is unreachable'));
    }
    return handleApiError(error);
  }
}
