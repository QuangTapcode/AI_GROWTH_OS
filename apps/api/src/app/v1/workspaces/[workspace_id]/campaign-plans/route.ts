import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import { handleApiError } from '@/lib/errors';
import pool from '@/lib/db';
import { PgPlanRepository } from '@/modules/campaignPlans/pgRepository';
import { createCampaignPlanRoutes } from '@/modules/campaignPlans/routes';

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const user = authenticateUser(req);
    const tenant = await resolveTenantContext(user, params.workspace_id);
    requireRole(tenant, ['owner', 'editor']);
    const result = await createCampaignPlanRoutes({ repo: new PgPlanRepository(pool) }).handleSubmit(tenant.workspaceId, await req.json());
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) { return handleApiError(error); }
}
