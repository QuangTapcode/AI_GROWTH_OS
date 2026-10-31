import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/auth';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import { AppError, handleApiError } from '@/lib/errors';
import pool from '@/lib/db';
import { PublishError, publishSeoArtifact } from '@/modules/site/publish';

/** Published site posts with their first-party counts for the last 7 days (internal visits shown separately). */
export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    const posts = (await pool.query(
      `SELECT c.id, c.title, c.slug, c.site_id, c.published_at, c.artifact_id,
         count(e.*) FILTER (WHERE e.event_type='page_view' AND NOT e.internal)::int AS page_views,
         count(e.*) FILTER (WHERE e.event_type='cta_click' AND NOT e.internal)::int AS cta_clicks,
         count(e.*) FILTER (WHERE e.internal)::int AS internal_events
       FROM contents c LEFT JOIN site_events e ON e.content_id=c.id AND e.occurred_at > now() - interval '7 days'
       WHERE c.workspace_id=$1 AND c.slug IS NOT NULL AND c.status='published'
       GROUP BY c.id ORDER BY c.published_at DESC`, [tenant.workspaceId],
    )).rows;
    return NextResponse.json({ items: posts }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return handleApiError(error); }
}

/** Owner publishes an approved SEO article (exact approved version) to the workspace's site. */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await resolveTenantContext(authenticateUser(req), params.workspace_id);
    requireRole(tenant, ['owner']);
    const body = z.object({ artifact_id: z.string().uuid() }).strict().safeParse(await req.json());
    if (!body.success) throw new AppError(422, 'INVALID_PUBLISH', 'artifact_id is required');
    const result = await publishSeoArtifact(pool, tenant.workspaceId, body.data.artifact_id, tenant.user.id);
    return NextResponse.json(result, { status: result.published ? 201 : 200 });
  } catch (error) {
    if (error instanceof PublishError) return handleApiError(new AppError(error.status, error.code, error.message));
    return handleApiError(error);
  }
}
