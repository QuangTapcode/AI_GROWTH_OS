import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { openGroupSession, publishGroupPost, readGroupInsights, readGroupPost } from './FacebookGroupBrowser.js';

function canonical(value:unknown):unknown {
  return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
    ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
}
/** Explicit operator command, never polled by the autopilot. One durable intent per publishing job. */
async function main(){
  const [action,workspaceId,jobId]=process.argv.slice(2);
  if(!['publish','sync','insights'].includes(action)||!/^[0-9a-f-]{36}$/i.test(workspaceId??'')
    ||!(action==='insights'?/^\d{5,30}$/:/^[0-9a-f-]{36}$/i).test(jobId??''))throw Error('USAGE: groupCommand publish|sync WORKSPACE_UUID JOB_UUID; insights WORKSPACE_UUID GROUP_ID');
  const root=(process.env.API_BASE_URL??'http://127.0.0.1:4000').replace(/\/v1\/?$/,'').replace(/\/$/,'');
  const gateway=process.env.WORKER_GATEWAY_TOKEN,internal=process.env.AUTOMATION_INTERNAL_TOKEN;
  if(!gateway||!internal)throw Error('GROUP_COMMAND_AUTH_REQUIRED');
  async function api(route:string,body?:unknown,method=body?'POST':'GET'){
    const r=await fetch(`${root}/v1/workspaces/${workspaceId}/${route}`,{method,headers:{authorization:`Bearer ${gateway}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw Error(`GROUP_API_${r.status}`);return r.json();
  }
  if(action==='insights'){
    const channels=await api('channels');
    if(!channels.items.some((c:{platform_name:string;channel_identifier:string})=>c.platform_name==='facebook_group'&&c.channel_identifier===jobId))throw Error('GROUP_BINDING_REQUIRED');
    const {browser,context}=await openGroupSession(resolve(process.env.FACEBOOK_GROUP_SESSION_PATH??'.fb-session.json'));
    try{
      const group=await readGroupInsights(context,jobId);
      const response=await fetch(`${root}/internal/metrics/group`,{method:'POST',headers:{authorization:`Bearer ${internal}`,'content-type':'application/json'},
        body:JSON.stringify({...group,workspace_id:workspaceId}),signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error(`GROUP_INGEST_${response.status}`);
      console.log(JSON.stringify({stored:true,...group}));
    }finally{await browser.close();}
    return;
  }
  const jobs=await api('publishing-jobs');const job=jobs.items.find((j:{id:string})=>j.id===jobId);
  const channels=await api('channels');const channel=channels.items.find((c:{id:string})=>c.id===job?.channel_id);
  if(!job||channel?.platform_name!=='facebook_group'||!channel.channel_identifier)throw Error('GROUP_JOB_BINDING_REQUIRED');
  const artifact=await api(`artifacts/${job.artifact_id}`);
  const result=artifact.payload?.result,text=result?.facebook?.text;
  if(typeof text!=='string'||!text.trim()||result.synthetic===true)throw Error('GROUP_APPROVED_TEXT_REQUIRED');
  const intent=resolve(process.env.GROUP_INTENT_DIRECTORY??'.',`group-publish-${jobId}.json`);
  // Reconcile a previously verified browser result without clicking Post again.
  let external=job.external_post_id;
  if(action==='publish'){
    if(job.status!=='scheduled'||job.mode!=='manual')throw Error('GROUP_SCHEDULED_MANUAL_JOB_REQUIRED');
    const approvals=await api('approvals');
    const approval=approvals.items.find((a:{target_id:string;target_type:string})=>a.target_id===artifact.id&&a.target_type==='artifact');
    const hash=createHash('sha256').update(JSON.stringify(canonical({result,evidence:artifact.evidence??[]}))).digest('hex');
    if(!approval||approval.status!=='approved'||approval.id!==job.approval_id||approval.target_version!==artifact.version
      ||approval.target_hash!==artifact.content_hash||hash!==artifact.content_hash)throw Error('GROUP_CURRENT_APPROVAL_REQUIRED');
    if(existsSync(intent)){
      const saved=JSON.parse(readFileSync(intent,'utf8'));
      if(saved.status!=='published'||saved.text_hash!==createHash('sha256').update(text).digest('hex'))throw Error('GROUP_INTENT_UNKNOWN_RECONCILE_NO_RETRY');
      external=saved.post_id;
    }
  }else if(job.status!=='published'||!external)throw Error('GROUP_PUBLISHED_JOB_REQUIRED');
  const {browser,context}=await openGroupSession(resolve(process.env.FACEBOOK_GROUP_SESSION_PATH??'.fb-session.json'));
  try{
    if(action==='publish'){
      if(!external){
        const posted=await publishGroupPost(context,{groupId:channel.channel_identifier,text,
          expectedHash:createHash('sha256').update(text).digest('hex'),intentPath:intent});
        external=posted.post_id;
      }
      await api(`publishing-jobs/${jobId}`,{action:'mark_published',external_post_id:external},'PATCH');
    }
    const observedText=process.env.GROUP_CONFIRMED_POST_TEXT??text;
    const post={...await readGroupPost(context,channel.channel_identifier,external,observedText),
      external_content_modified:observedText!==text,observed_text_hash:createHash('sha256').update(observedText).digest('hex')};
    const group=await readGroupInsights(context,channel.channel_identifier);
    const response=await fetch(`${root}/internal/metrics/group`,{method:'POST',headers:{authorization:`Bearer ${internal}`,'content-type':'application/json'},
      body:JSON.stringify({...group,workspace_id:workspaceId,post:{...post,job_id:jobId}}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(`GROUP_INGEST_${response.status}`);
    console.log(JSON.stringify({stored:true,group_id:group.group_id,post_id:post.post_id,counters:post.counters,period:[group.period_from,group.period_to],metrics:group.metrics,total_members:group.total_members}));
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'GROUP_COMMAND_FAILED');process.exitCode=1;});
