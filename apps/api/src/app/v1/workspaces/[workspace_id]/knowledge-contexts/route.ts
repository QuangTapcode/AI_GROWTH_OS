import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import { handleApiError } from '@/lib/errors';
import pool from '@/lib/db';
import { PgPlanRepository } from '@/modules/campaignPlans/pgRepository';

export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    const context = await new PgPlanRepository(pool).loadContext(tenant.workspaceId);
    return NextResponse.json({ context: context ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return handleApiError(error); }
}

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    requireRole(tenant, ['owner', 'editor']);
    // No client-provided source approvals, facts or asset rights.
    const result = await new PgPlanRepository(pool).issueContext(tenant.workspaceId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return handleApiError(error); }
}
