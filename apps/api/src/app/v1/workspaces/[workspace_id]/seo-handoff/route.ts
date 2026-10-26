import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/auth';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import { AppError, handleApiError } from '@/lib/errors';
import pool from '@/lib/db';
import { PgPlanRepository } from '@/modules/campaignPlans/pgRepository';
import { PlanError, submitCampaignPlan } from '@/modules/campaignPlans/service';

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    requireRole(tenant, ['owner', 'editor']);
    const body = z.object({ plan_artifact_id: z.string().uuid() }).strict().safeParse(await req.json());
    if (!body.success) throw new AppError(422, 'INVALID_PLAN_ARTIFACT', 'A Growth Lead plan artifact ID is required');
    const artifact = (await pool.query("SELECT payload FROM content_artifacts WHERE workspace_id=$1 AND id=$2 AND role='growth_lead' AND operation='strategy.generate'", [tenant.workspaceId, body.data.plan_artifact_id])).rows[0];
    if (!artifact?.payload?.artifact) throw new AppError(404, 'PLAN_NOT_FOUND', 'Growth Lead plan not found in workspace');
    const accepted = await submitCampaignPlan({ repo: new PgPlanRepository(pool, { requireApprovedArtifactId: body.data.plan_artifact_id }), allowSynthetic: ['local', 'test', 'development'].includes(process.env.APP_ENV ?? '') }, tenant.workspaceId, artifact.payload.artifact);
    return NextResponse.json({ plan_id: accepted.record.plan.plan_id, deduplicated: accepted.deduplicated, tasks: accepted.record.plan.tasks.map((task) => ({ task_id: task.task_id, role: task.role, operation: task.operation })) }, { status: accepted.deduplicated ? 200 : 201 });
  } catch (error) { return handleApiError(error instanceof PlanError ? new AppError(error.status, error.code, error.message) : error); }
}
