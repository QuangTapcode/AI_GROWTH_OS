import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import { periodSchema } from '../metrics/period';

const count=z.number().int().nonnegative().nullable();
export const groupObservationSchema=z.object({
  workspace_id:z.string().uuid(),group_id:z.string().regex(/^\d{5,30}$/),source:z.literal('facebook_group_browser'),
  captured_at:z.string().datetime({offset:true}),period_from:z.string(),period_to:z.string(),timezone:z.literal('provider_unspecified'),
  metrics:z.object({posts:count,comments:count,reactions:count,new_members:count}).strict(),total_members:count,
  source_url:z.string().url(),missing_reasons:z.record(z.string().max(100)).default({}),
  post:z.object({job_id:z.string().uuid(),post_id:z.string().regex(/^\d+$/),source_url:z.string().url(),captured_at:z.string().datetime({offset:true}),
    external_content_modified:z.boolean().default(false),observed_text_hash:z.string().regex(/^[a-f0-9]{64}$/).optional(),
    counters:z.object({reactions:count,comments:count,shares:count}).strict()}).strict().optional(),
}).strict();

/** Trusted worker observations only; identities are re-resolved from the tenant ledger, never accepted from the browser. */
export async function recordGroupObservation(pool:Pool,raw:unknown) {
  const parsed=groupObservationSchema.safeParse(raw);
  if(!parsed.success)throw new AppError(422,'INVALID_GROUP_OBSERVATION','Invalid group observation');
  const data=parsed.data;
  if(!periodSchema.safeParse({from:data.period_from,to:data.period_to}).success||data.period_to>data.captured_at.slice(0,10)
    ||Date.parse(data.captured_at)>Date.now()+5000)throw new AppError(422,'INVALID_GROUP_PERIOD','Use the actual provider period and capture time');
  const prefix=`https://www.facebook.com/groups/${data.group_id}`;
  if(data.source_url!==prefix+'/insights/?section=engagement')throw new AppError(422,'GROUP_SOURCE_MISMATCH','Use the exact group insights source');
  const binding=(await pool.query(`SELECT id FROM channels WHERE workspace_id=$1 AND platform_name='facebook_group' AND channel_identifier=$2`,[data.workspace_id,data.group_id])).rows[0];
  if(!binding)throw new AppError(403,'GROUP_NOT_BOUND','Bind this group to the workspace first');
  let post:Record<string,unknown>|null=null;
  if(data.post){
    const job=(await pool.query(`SELECT pj.id,pj.content_id,pj.artifact_id,a.version AS artifact_version,pj.external_post_id,pj.published_at
      FROM publishing_jobs pj JOIN channels ch ON ch.id=pj.channel_id AND ch.workspace_id=pj.workspace_id
      JOIN content_artifacts a ON a.id=pj.artifact_id AND a.workspace_id=pj.workspace_id
      WHERE pj.workspace_id=$1 AND pj.id=$2 AND pj.status='published' AND ch.platform_name='facebook_group' AND ch.channel_identifier=$3`,[data.workspace_id,data.post.job_id,data.group_id])).rows[0];
    if(!job||job.external_post_id!==data.post.post_id||data.post.source_url!==`${prefix}/posts/${data.post.post_id}/`
      ||Date.parse(data.post.captured_at)<new Date(job.published_at).getTime()||Date.parse(data.post.captured_at)>Date.parse(data.captured_at))
      throw new AppError(422,'GROUP_POST_MISMATCH','Observation must match a published workspace-owned post and capture time');
    post={publishing_job_id:job.id,content_id:job.content_id,artifact_id:job.artifact_id,artifact_version:job.artifact_version,
      external_post_id:data.post.post_id,external_content_modified:data.post.external_content_modified,observed_text_hash:data.post.observed_text_hash??null,group_id:data.group_id,scope:'post_lifetime',source_url:data.post.source_url,source:data.source};
  }
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const points=[...Object.entries(data.metrics).map(([metric,value])=>({metric:`group_${metric}`,value,captured:data.captured_at,metadata:{group_id:data.group_id,
      scope:'group_provider_period',source_url:data.source_url,source:data.source},reason:data.missing_reasons[metric]})),
      {metric:'group_total_members',value:data.total_members,captured:data.captured_at,metadata:{group_id:data.group_id,scope:'group_current',source_url:prefix,source:data.source},reason:'COUNTER_NOT_VISIBLE'}];
    for(const point of points)await db.query(`INSERT INTO metrics_snapshots(workspace_id,provider,metric_name,period_from,period_to,timezone,metric_value,availability,missing_reason,metadata,captured_at)
      VALUES($1,'facebook_group',$2,$3::date,$4::date,$5,$6,$7,$8,$9::jsonb,$10::timestamptz)`,[data.workspace_id,point.metric,data.period_from,data.period_to,data.timezone,
      point.value,point.value===null?'missing':'available',point.value===null?point.reason??'COUNTER_NOT_VISIBLE':null,JSON.stringify(point.metadata),point.captured]);
    if(data.post&&post)for(const [metric,value] of Object.entries(data.post.counters))await db.query(`INSERT INTO metrics_snapshots(workspace_id,provider,metric_name,period_from,period_to,timezone,metric_value,availability,missing_reason,metadata,captured_at)
      VALUES($1,'facebook_group',$2,($3::timestamptz AT TIME ZONE 'UTC')::date,($3::timestamptz AT TIME ZONE 'UTC')::date,'UTC',$4,$5,$6,$7::jsonb,$3::timestamptz)`,
      [data.workspace_id,`facebook_${metric}`,data.post.captured_at,value,value===null?'missing':'available',value===null?'COUNTER_NOT_VISIBLE':null,JSON.stringify(post)]);
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  return {stored:true,group_id:data.group_id,post_recorded:post!==null};
}

export async function groupMetricEvidence(pool:Pool,workspace:string,capturedAt=new Date()) {
  const rows=(await pool.query(`SELECT DISTINCT ON(s.metadata->>'group_id',s.metric_name) s.metric_name,s.metric_value,s.missing_reason,s.captured_at,
      s.period_from::text,s.period_to::text,s.timezone,s.metadata FROM metrics_snapshots s JOIN channels ch ON ch.workspace_id=s.workspace_id
        AND ch.platform_name='facebook_group' AND ch.channel_identifier=s.metadata->>'group_id'
      WHERE s.workspace_id=$1 AND s.provider='facebook_group' AND s.metadata->>'scope' IN ('group_provider_period','group_current') AND s.captured_at=(SELECT max(recent.captured_at) FROM metrics_snapshots recent WHERE recent.workspace_id=s.workspace_id AND recent.provider='facebook_group' AND recent.metadata->>'group_id'=s.metadata->>'group_id' AND recent.metadata->>'scope'='group_provider_period' AND recent.captured_at<=$2)
      ORDER BY s.metadata->>'group_id',s.metric_name,s.captured_at DESC,s.id DESC LIMIT 50`,[workspace,capturedAt])).rows;
  const groups=new Map<string,Record<string,unknown>>();
  for(const row of rows){
    const id=row.metadata.group_id;
    if(!groups.has(id))groups.set(id,{workspace_id:workspace,group_id:id,source:'facebook_group_browser',captured_at:row.captured_at,
      period_from:row.period_from,period_to:row.period_to,timezone:row.timezone,source_url:`https://www.facebook.com/groups/${id}/insights/?section=engagement`,
      total_members:null,metrics:{posts:null,comments:null,reactions:null,new_members:null},missing_reasons:{}});
    const group=groups.get(id)!;
    // Do not combine different provider periods or capture runs into one group observation.
    if(row.period_from!==group.period_from||row.period_to!==group.period_to||new Date(row.captured_at).getTime()!==new Date(group.captured_at as string).getTime())continue;
    const value=row.metric_value===null?null:Number(row.metric_value),metric=row.metric_name.replace(/^group_/,'');
    if(metric==='total_members')group.total_members=value;else (group.metrics as Record<string,unknown>)[metric]=value;
    if(value===null)(group.missing_reasons as Record<string,unknown>)[metric]=row.missing_reason;
  }
  return [...groups.values()];
}

export async function groupPostEvidence(pool:Pool,workspace:string,start:Date,end:Date,capturedAt:Date) {
  return (await pool.query(`SELECT pj.workspace_id,pj.id AS publishing_job_id,pj.content_id,pj.artifact_id,a.version AS artifact_version,
      NULL::uuid AS campaign_id,pj.external_post_id,pj.published_at,latest.captured_at,latest.counters,latest.missing_reasons,latest.external_content_modified,latest.observed_text_hash,
      'facebook_group' AS provider,ch.channel_identifier AS group_id,'post_lifetime' AS scope
    FROM publishing_jobs pj JOIN channels ch ON ch.id=pj.channel_id AND ch.workspace_id=pj.workspace_id
    JOIN content_artifacts a ON a.id=pj.artifact_id AND a.workspace_id=pj.workspace_id
    JOIN LATERAL(SELECT max(s.captured_at) AS captured_at,jsonb_object_agg(replace(s.metric_name,'facebook_',''),s.metric_value) AS counters,
      coalesce(jsonb_object_agg(replace(s.metric_name,'facebook_',''),s.missing_reason) FILTER(WHERE s.metric_value IS NULL),'{}') AS missing_reasons,
      bool_or(coalesce((s.metadata->>'external_content_modified')::boolean,false)) AS external_content_modified,
      max(s.metadata->>'observed_text_hash') AS observed_text_hash
      FROM(SELECT DISTINCT ON(metric_name) metric_name,metric_value,captured_at,missing_reason,metadata FROM metrics_snapshots
        WHERE metric_name IN ('facebook_reactions','facebook_comments','facebook_shares') AND workspace_id=pj.workspace_id AND provider='facebook_group' AND metadata->>'scope'='post_lifetime' AND metadata->>'group_id'=ch.channel_identifier
          AND metadata->>'publishing_job_id'=pj.id::text AND metadata->>'artifact_id'=a.id::text AND metadata->>'artifact_version'=a.version::text
          AND metadata->>'external_post_id'=pj.external_post_id AND captured_at<=$4 AND captured_at>=pj.published_at
        ORDER BY metric_name,captured_at DESC,id DESC) s) latest ON latest.captured_at IS NOT NULL
    WHERE pj.workspace_id=$1 AND ch.platform_name='facebook_group' AND pj.status='published' AND pj.published_at>=$2 AND pj.published_at<$3
    ORDER BY pj.published_at DESC LIMIT 20`,[workspace,start,end,capturedAt])).rows;
}
