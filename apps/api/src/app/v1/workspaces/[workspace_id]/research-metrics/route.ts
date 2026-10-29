import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import pool from '@/lib/db';
import { researchMetricsRange, syncResearchSearchMetrics } from '@/modules/research/searchMetrics';

const input = z.object({ context_snapshot_id: z.string().uuid(), from: z.string().optional(), to: z.string().optional() }).strict();

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    requireRole(tenant, ['owner', 'editor']);
    const body = input.parse(await req.json());
    const defaults = researchMetricsRange();
    return NextResponse.json(await syncResearchSearchMetrics(pool, tenant.workspaceId, body.context_snapshot_id,
      { from: body.from ?? defaults.from, to: body.to ?? defaults.to }));
  } catch (error) { return handleApiError(error); }
}
