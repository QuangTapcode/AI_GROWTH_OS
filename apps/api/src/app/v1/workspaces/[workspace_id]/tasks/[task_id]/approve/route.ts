import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/auth';
import { handleApiError, AppError } from '@/lib/errors';
import pool from '@/lib/db';
import { approvePlanTask } from '@/modules/campaignPlans/approveTask';
import { PlanError } from '@/modules/campaignPlans/service';

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string; task_id: string } }) {
  try {
    const user = authenticateUser(req);
    const parsed = z.object({ expected_version: z.number().int().positive(), expected_hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().safeParse(await req.json());
    if (!parsed.success) throw new AppError(422, 'VALIDATION_FAILED', 'Expected exact artifact version and SHA-256 hash');
    return NextResponse.json(await approvePlanTask(pool, { workspaceId: params.workspace_id, taskId: params.task_id,
      actorId: user.id, version: parsed.data.expected_version, hash: parsed.data.expected_hash }));
  } catch (error) {
    if (error instanceof PlanError) return handleApiError(new AppError(error.status, error.code, error.message));
    return handleApiError(error);
  }
}
