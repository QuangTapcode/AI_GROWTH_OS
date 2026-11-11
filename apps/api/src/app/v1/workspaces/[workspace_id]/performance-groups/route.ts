import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { authenticateUser } from '@/lib/auth';
import { resolveTenantContext } from '@/lib/tenant';
import { handleApiError } from '@/lib/errors';
import { groupMetricEvidence,groupPostEvidence } from '@/modules/performance/groups';

export async function GET(req:NextRequest,{params}:{params:{workspace_id:string}}){
  try{
    const tenant=await resolveTenantContext(authenticateUser(req),params.workspace_id);
    const now=new Date();
    return NextResponse.json({groups:await groupMetricEvidence(pool,tenant.workspaceId,now),
      posts:await groupPostEvidence(pool,tenant.workspaceId,new Date(now.getTime()-30*86400000),now,now)});
  }catch(error){return handleApiError(error);}
}
