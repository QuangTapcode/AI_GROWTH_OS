import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { assignExperiment } from '@/modules/performance/experiments';
import { isInternal } from '@/modules/site/events';

export async function POST(req: NextRequest, { params }: { params: { site_id: string } }) {
  try {
    const result = await assignExperiment(pool, params.site_id, await req.json(), isInternal(req.headers.get('x-forwarded-for'), req.headers.get('x-real-ip')));
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return handleApiError(error); }
}
