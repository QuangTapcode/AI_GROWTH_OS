import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { handleApiError, AppError } from '@/lib/errors';
import pool from '@/lib/db';
import { enqueueAiTask } from '@/modules/campaignPlans/aiTasks';
import { PlanError } from '@/modules/campaignPlans/service';

/**
 * Start an AI task for this workspace. The request never reaches the AI service directly:
 * it goes through the same validation as /ai-tasks (active owner/editor, the workspace's
 * current backend-issued context, artifact ownership) so a caller cannot submit a job for
 * another workspace, a stale snapshot or arbitrary payload.
 */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const actor = authenticateUser(req);
    const input = await req.json().catch(() => null);
    const context = (await pool.query(
      'SELECT snapshot_id FROM knowledge_contexts WHERE workspace_id=$1 AND current', [params.workspace_id],
    )).rows[0];
    if (!context) throw new AppError(409, 'MISSING_CONTEXT', 'Create a current knowledge context first');
    const result = await enqueueAiTask(pool, params.workspace_id, actor.id, { context_snapshot_id: context.snapshot_id, input });
    return NextResponse.json(result, { status: result.deduplicated ? 200 : 202 });
  } catch (error) {
    return handleApiError(error instanceof PlanError ? new AppError(error.status, error.code, error.message) : error);
  }
}
