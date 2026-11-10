import { createHash } from 'node:crypto';
import { dirname,resolve } from 'node:path';
import { existsSync,mkdirSync,readFileSync,renameSync,writeFileSync } from 'node:fs';
import type { Pool } from 'pg';
import { z } from 'zod';
import { openGroupSession,readGroupInsights,readGroupPost } from '../publish/FacebookGroupBrowser.js';

export const groupScheduleSchema=z.object({
  interval_minutes:z.number().int().min(5).max(1440).default(15),
  session_path:z.string().min(1),status_path:z.string().min(1),
  targets:z.array(z.object({workspace_id:z.string().uuid(),group_id:z.string().regex(/^\d{5,30}$/),
    post_text_overrides:z.record(z.string().uuid(),z.string().min(1).max(10000)).default({}),
  }).strict()).min(1).max(10),
}).strict().superRefine((c,ctx)=>{
  const keys=c.targets.map(t=>`${t.workspace_id}:${t.group_id}`);
  if(new Set(keys).size!==keys.length)ctx.addIssue({code:'custom',message:'Duplicate group target'});
});
type Config=z.infer<typeof groupScheduleSchema>;
type RecordState={status:'ok'|'partial'|'error';last_attempt_at:string;next_due_at:string;last_success_at?:string;
  requires_reauth:boolean;error_code?:string;posts?:{job_id:string;counters:Record<string,number|null>}[];post_errors?:{job_id:string;code:string}[]};
type Records=Record<string,RecordState>;
const authError=(code:string)=>/GROUP_(SESSION|LOGIN)/.test(code);
// Never persist provider text, cookies, tokens, connection strings or arbitrary exception messages.
export function groupErrorCode(error:unknown){
  const message=error instanceof Error?error.message:'';
  return /^GROUP_[A-Z0-9_]+$/.test(message)?message:'GROUP_SYNC_FAILED';
}
export function loadGroupSchedule(path:string):Config{
  let raw:unknown;
  try{raw=JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));}catch{throw Error('GROUP_SCHEDULE_CONFIG_INVALID');}
  const result=groupScheduleSchema.safeParse(raw);
  if(!result.success)throw Error('GROUP_SCHEDULE_CONFIG_INVALID');
  return {...result.data,session_path:resolve(dirname(path),result.data.session_path),status_path:resolve(dirname(path),result.data.status_path)};
}
const defaults={open:openGroupSession,readPost:readGroupPost,readInsights:readGroupInsights,fetch:globalThis.fetch,
  load:(path:string):Records=>{
    if(!existsSync(path))return {};
    try{
      const saved=JSON.parse(readFileSync(path,'utf8'));
      if(!saved.records||typeof saved.records!=='object'||Array.isArray(saved.records))throw Error();
      for(const value of Object.values(saved.records) as RecordState[])if(!Number.isFinite(Date.parse(value.next_due_at)))throw Error();
      return saved.records;
    }catch{throw Error('GROUP_SCHEDULE_STATE_INVALID');}
  },
  save:(path:string,records:Records)=>{
    mkdirSync(dirname(path),{recursive:true});const temp=path+`.${process.pid}.tmp`;
    writeFileSync(temp,JSON.stringify({updated_at:new Date().toISOString(),records},null,2));renameSync(temp,path);
  },
};

/** Read-only collection, independent of AUTOPILOT. No approval, publishing or sharing action is invoked. */
export class GroupMetricsScheduler {
  private busy=false;
  private records:Records;
  private readonly deps:typeof defaults;
  constructor(private pool:Pool,private config:Config,private apiBase:string,private token:string,deps:Partial<typeof defaults>={}){
    if(!token)throw Error('GROUP_SYNC_AUTH_REQUIRED');
    this.deps={...defaults,...deps};this.records=this.deps.load(config.status_path);
    this.apiBase=apiBase.replace(/\/v1\/?$/,'').replace(/\/$/,'');
  }
  async tick(now=Date.now(),options:{force?:boolean}={}){
    if(this.busy)return {processed:0,busy:true};
    this.busy=true;let processed=0;
    try{
      for(const target of this.config.targets){
        const key=`${target.workspace_id}:${target.group_id}`,previous=this.records[key];
        if(!options.force&&previous&&Date.parse(previous.next_due_at)>now)continue;
        const db=await this.pool.connect();let locked=false;
        try{
          locked=(await db.query('SELECT pg_try_advisory_lock(736411,hashtext($1)) AS locked',[key])).rows[0]?.locked===true;
          if(!locked)continue;
          // Database capture time also prevents another worker with a different status file collecting too early.
          const last=(await db.query(`SELECT max(captured_at) AS captured_at FROM metrics_snapshots
            WHERE workspace_id=$1 AND provider='facebook_group' AND metadata->>'group_id'=$2 AND metadata->>'scope'='group_provider_period'`,[target.workspace_id,target.group_id])).rows[0]?.captured_at;
          if(!options.force&&last&&new Date(last).getTime()+this.config.interval_minutes*60000>now){
            this.records[key]={status:'ok',last_attempt_at:new Date(now).toISOString(),last_success_at:new Date(last).toISOString(),
              next_due_at:new Date(new Date(last).getTime()+this.config.interval_minutes*60000).toISOString(),requires_reauth:false};
            this.deps.save(this.config.status_path,this.records);continue;
          }
          const binding=(await db.query(`SELECT id FROM channels WHERE workspace_id=$1 AND platform_name='facebook_group' AND channel_identifier=$2`,[target.workspace_id,target.group_id])).rows[0];
          if(!binding)throw Error('GROUP_NOT_BOUND');
          const jobs=(await db.query(`SELECT pj.id,pj.external_post_id,a.payload FROM publishing_jobs pj
            JOIN channels ch ON ch.id=pj.channel_id AND ch.workspace_id=pj.workspace_id
            JOIN content_artifacts a ON a.id=pj.artifact_id AND a.workspace_id=pj.workspace_id
            WHERE pj.workspace_id=$1 AND ch.platform_name='facebook_group' AND ch.channel_identifier=$2
              AND pj.status='published' AND pj.external_post_id ~ '^[0-9]+$' AND pj.published_at>=now()-interval '30 days'
            ORDER BY pj.published_at DESC LIMIT 20`,[target.workspace_id,target.group_id])).rows;
          const {browser,context}=await this.deps.open(this.config.session_path,{headless:true});
          const posts:({job_id:string}&Awaited<ReturnType<typeof readGroupPost>>&{external_content_modified:boolean;observed_text_hash:string})[]=[];
          const errors:{job_id:string;code:string}[]=[];
          try{
            for(const job of jobs){
              try{
                const original=job.payload?.result?.facebook?.text;
                if(typeof original!=='string'||job.payload?.result?.synthetic===true)throw Error('GROUP_APPROVED_TEXT_REQUIRED');
                const observed=target.post_text_overrides[job.id]??original;
                posts.push({...await this.deps.readPost(context,target.group_id,job.external_post_id,observed),job_id:job.id,
                  external_content_modified:observed!==original,observed_text_hash:createHash('sha256').update(observed).digest('hex')});
              }catch(error){const code=groupErrorCode(error);if(authError(code))throw error;errors.push({job_id:job.id,code});}
            }
            const group=await this.deps.readInsights(context,target.group_id);
            for(const post of posts.length?posts:[undefined]){
              const response=await this.deps.fetch(`${this.apiBase}/internal/metrics/group`,{method:'POST',
                headers:{authorization:`Bearer ${this.token}`,'content-type':'application/json'},
                body:JSON.stringify({...group,workspace_id:target.workspace_id,...(post?{post}:{})}),signal:AbortSignal.timeout(30000)});
              if(!response.ok)throw Error(`GROUP_INGEST_${response.status}`);
            }
            const finished=Date.now();
            this.records[key]={status:errors.length?'partial':'ok',last_attempt_at:new Date(now).toISOString(),last_success_at:new Date(finished).toISOString(),
              next_due_at:new Date(finished+this.config.interval_minutes*60000).toISOString(),requires_reauth:false,
              posts:posts.map(p=>({job_id:p.job_id,counters:p.counters})),post_errors:errors};
          }finally{await browser.close();}
          processed++;
        }catch(error){
          const code=groupErrorCode(error);
          this.records[key]={...previous,status:'error',last_attempt_at:new Date(now).toISOString(),
            next_due_at:new Date(Date.now()+this.config.interval_minutes*60000).toISOString(),requires_reauth:authError(code),error_code:code};
          console.warn('[group-metrics]',target.group_id,code);
        }finally{
          let discard=false;
          try{if(locked)await db.query('SELECT pg_advisory_unlock(736411,hashtext($1))',[key]);}
          catch{discard=true;}
          finally{db.release(discard);}
          if(locked)this.deps.save(this.config.status_path,this.records);
        }
      }
      return {processed,busy:false};
    }finally{this.busy=false;}
  }
}
