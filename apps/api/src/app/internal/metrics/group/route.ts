import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { recordGroupObservation } from '@/modules/performance/groups';

export async function POST(req: NextRequest) {
  const token=process.env.AUTOMATION_INTERNAL_TOKEN;
  const actual=Buffer.from(req.headers.get('authorization')??'');
  const expected=Buffer.from(`Bearer ${token??''}`);
  if(!token||actual.length!==expected.length||!timingSafeEqual(actual,expected))
    return NextResponse.json({error:{code:'UNAUTHORIZED'}},{status:401});
  try { return NextResponse.json(await recordGroupObservation(pool,await req.json())); }
  catch(error){return handleApiError(error);}
}
