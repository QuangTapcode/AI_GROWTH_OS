import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { AppError, handleApiError } from '@/lib/errors';
import { isInternal, recordSiteEvent, siteEventSchema } from '@/modules/site/events';

/** Anonymous first-party page view / CTA click from the public site (no IP or PII stored). */
export async function POST(req: NextRequest, { params }: { params: { site_id: string } }) {
  try {
    const parsed = siteEventSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError(422, 'INVALID_EVENT', 'Expected event_type, session_id and path');
    const internal = isInternal(req.headers.get('x-forwarded-for'), req.headers.get('x-real-ip'));
    const result = await recordSiteEvent(pool, params.site_id, parsed.data, internal);
    if (!result.recorded && 'reason' in result) throw new AppError(404, result.reason as string, 'Unknown site');
    return NextResponse.json(result, { status: 202 });
  } catch (error) { return handleApiError(error); }
}
