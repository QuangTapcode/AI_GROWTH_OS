import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { handleApiError, AppError } from '@/lib/errors';
import pool from '@/lib/db';
import { acceptLearningTasks } from '@/modules/campaignPlans/learningTasks';
import { PlanError } from '@/modules/campaignPlans/service';

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const actor = authenticateUser(req);
    return NextResponse.json(await acceptLearningTasks(pool, params.workspace_id, actor.id, await req.json()));
  } catch (error) {
    return handleApiError(error instanceof PlanError ? new AppError(error.status, error.code, error.message) : error);
  }
}
