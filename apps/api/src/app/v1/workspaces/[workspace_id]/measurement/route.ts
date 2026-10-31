import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { AppError, handleApiError } from '@/lib/errors';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import pool from '@/lib/db';
import { ensureBaselineArtifact, ensureMeasurementArtifacts } from '@/modules/site/measurement';

/**
 * First-party metrics/lead aggregate for Performance and Learning when the scheduler is off.
 * Reuses a snapshot from the last hour; counts come from site events and leads, never the client.
 */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    requireRole(tenant, ['owner', 'editor']);
    const context = (await pool.query('SELECT snapshot_id FROM knowledge_contexts WHERE workspace_id=$1 AND current', [tenant.workspaceId])).rows[0];
    if (!context) throw new AppError(409, 'MISSING_CONTEXT', 'Create a current knowledge context with approved sources first');
    const result = await ensureMeasurementArtifacts(pool, tenant.workspaceId, context.snapshot_id);
    const baseline = await ensureBaselineArtifact(pool, tenant.workspaceId, context.snapshot_id, result.metrics_artifact_id);
    return NextResponse.json({ context_snapshot_id: context.snapshot_id, ...result, baseline_metrics_artifact_id: baseline ?? null },
      { status: result.created ? 201 : 200 });
  } catch (error) { return handleApiError(error); }
}
