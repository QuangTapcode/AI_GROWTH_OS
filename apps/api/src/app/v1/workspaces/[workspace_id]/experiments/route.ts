import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import { authenticateUser } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import { changeExperiment, createExperiment, listExperiments } from '@/modules/performance/experiments';

type Params = { params: { workspace_id: string } };
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    return NextResponse.json({ items: await listExperiments(pool, tenant.workspaceId) });
  } catch (error) { return handleApiError(error); }
}
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    requireRole(tenant, ['owner','editor']);
    return NextResponse.json(await createExperiment(pool, tenant.workspaceId, await req.json()), { status: 201 });
  } catch (error) { return handleApiError(error); }
}
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = authenticateUser(req);
    const tenant = await resolveTenantContext(user, params.workspace_id);
    requireRole(tenant, ['owner']);
    const body = z.object({ id: z.string().uuid(), action: z.enum(['start','stop']) }).strict().parse(await req.json());
    return NextResponse.json(await changeExperiment(pool, tenant.workspaceId, body.id, user.id, body.action));
  } catch (error) { return handleApiError(error); }
}
