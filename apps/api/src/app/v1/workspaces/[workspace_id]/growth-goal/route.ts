import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import { AppError, handleApiError } from '@/lib/errors';
import pool from '@/lib/db';
import { activeGoal, goalInputSchema, setGoal } from '@/modules/growthGoals/service';

export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    return NextResponse.json({ goal: await activeGoal(pool, tenant.workspaceId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return handleApiError(error); }
}

/** Owner sets the measurable goal; issue a new knowledge context afterwards to use it. */
export async function PUT(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    requireRole(tenant, ['owner']);
    const parsed = goalInputSchema.safeParse(await req.json());
    if (!parsed.success) throw new AppError(422, 'INVALID_GOAL', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    return NextResponse.json({ goal: await setGoal(pool, tenant.workspaceId, parsed.data) });
  } catch (error) { return handleApiError(error); }
}
