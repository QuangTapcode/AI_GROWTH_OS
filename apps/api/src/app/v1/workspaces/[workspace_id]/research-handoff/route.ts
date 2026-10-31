import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/auth';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import { AppError, handleApiError } from '@/lib/errors';
import pool from '@/lib/db';
import { enqueueAiTask } from '@/modules/campaignPlans/aiTasks';
import { PlanError } from '@/modules/campaignPlans/service';

const schema = z.object({ research_artifact_id: z.string().uuid(), cta: z.string().trim().min(1).max(200), deadline: z.string().datetime({ offset: true }) }).strict();

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const user = authenticateUser(req);
    const tenant = await resolveTenantContext(user, params.workspace_id);
    requireRole(tenant, ['owner', 'editor']);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new AppError(422, 'INVALID_HANDOFF', 'Research artifact, CTA and deadline are required');
    const input = parsed.data;
    const row = (await pool.query(`SELECT a.* FROM content_artifacts a JOIN knowledge_contexts k
      ON k.workspace_id=a.workspace_id AND k.snapshot_id=a.context_snapshot_id AND k.current
      WHERE a.workspace_id=$1 AND a.id=$2 AND a.role='research' AND a.operation='research.run'`, [tenant.workspaceId, input.research_artifact_id])).rows[0];
    if (!row) throw new AppError(422, 'RESEARCH_CONTEXT_MISMATCH', 'Research artifact is missing or belongs to an old context');
    if (row.payload?.result?.status !== 'ready_for_handoff' || !row.payload?.result?.findings?.length) throw new AppError(422, 'RESEARCH_NOT_READY', 'Research needs grounded findings before handoff');
    const key = createHash('sha256').update(JSON.stringify([tenant.workspaceId, row.id, row.version, row.content_hash, input.cta, input.deadline])).digest('hex');
    const taskId = `${key.slice(0, 8)}-${key.slice(8, 12)}-5${key.slice(13, 16)}-a${key.slice(17, 20)}-${key.slice(20, 32)}`;
    const result = await enqueueAiTask(pool, tenant.workspaceId, user.id, {
      task_id: taskId, context_snapshot_id: row.context_snapshot_id, synthetic: row.payload.result.synthetic === true,
      input: { operation: 'strategy.generate', ...input },
    });
    return NextResponse.json({ ...result, research_artifact_id: row.id }, { status: result.deduplicated ? 200 : 202 });
  } catch (error) { return handleApiError(error instanceof PlanError ? new AppError(error.status, error.code, error.message) : error); }
}
