import { afterEach,expect,it,vi } from 'vitest';
import type { Pool } from 'pg';
import { GroupMetricsScheduler,groupScheduleSchema } from '../src/metrics/GroupMetricsScheduler';

const workspace='10000000-0000-4000-8000-000000000001',group='1134282109069209',job='6500b610-87e7-47e6-aff8-585817f5c7c0';
const config=()=>groupScheduleSchema.parse({session_path:'test-only-session',status_path:'test-only-status',interval_minutes:15,
  targets:[{workspace_id:workspace,group_id:group,post_text_overrides:{[job]:'Edited text'}}]});
function setup({locked=true,bound=true,recent=false}:{locked?:boolean;bound?:boolean;recent?:boolean}={}){
  const query=vi.fn(async(sql:string,_args?:unknown[])=>{
    if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked}]};
    if(sql.includes('max(captured_at)'))return {rows:[{captured_at:recent?new Date():null}]};
    if(sql.includes('SELECT id FROM channels'))return {rows:bound?[{id:'channel'}]:[]};
    if(sql.includes('SELECT pj.id'))return {rows:[{id:job,external_post_id:'1234567',payload:{result:{facebook:{text:'Approved text'},synthetic:false}}}]};
    return {rows:[]};
  });
  const release=vi.fn(),pool={connect:vi.fn(async()=>({query,release}))} as unknown as Pool;
  const close=vi.fn(async()=>{});
  const deps={
    open:vi.fn(async()=>({browser:{close},context:{}})),
    readPost:vi.fn(async()=>({post_id:'1234567',source_url:`https://www.facebook.com/groups/${group}/posts/1234567/`,captured_at:new Date().toISOString(),counters:{reactions:1,comments:0,shares:1}})),
    readInsights:vi.fn(async()=>({group_id:group,source:'facebook_group_browser',captured_at:new Date().toISOString(),period_from:'2026-10-12',period_to:'2026-11-08',timezone:'provider_unspecified',metrics:{posts:6,comments:1,reactions:2,new_members:null},total_members:7,source_url:`https://www.facebook.com/groups/${group}/insights/?section=engagement`,missing_reasons:{new_members:'COUNTER_NOT_VISIBLE'}})),
    fetch:vi.fn(async()=>new Response('{}',{status:200})),load:vi.fn(()=>({})),save:vi.fn(),
  };
  const scheduler=new GroupMetricsScheduler(pool,config(),'http://localhost:4000/v1','internal-test-token',deps as unknown as NonNullable<ConstructorParameters<typeof GroupMetricsScheduler>[4]>);
  return {scheduler,deps,query,release,close};
}
afterEach(()=>{vi.restoreAllMocks();});
it('collects only the bound published Group job, marks external edits and waits for the next interval',async()=>{
  const {scheduler,deps,query,close}=setup();
  expect(await scheduler.tick()).toMatchObject({processed:1});
  const body=JSON.parse((deps.fetch.mock.calls as unknown as [string,RequestInit][])[0][1].body as string);
  expect(body).toMatchObject({workspace_id:workspace,group_id:group,post:{job_id:job,external_content_modified:true,counters:{shares:1,comments:0}}});
  expect(deps.open).toHaveBeenCalledWith('test-only-session',{headless:true});
  expect(deps.readPost).toHaveBeenCalledWith({},group,'1234567','Edited text');
  expect(query.mock.calls.find(c=>c[0].includes('SELECT pj.id'))?.[1]).toEqual([workspace,group]);
  expect(close).toHaveBeenCalled();
  expect(await scheduler.tick()).toMatchObject({processed:0});
  expect(deps.fetch).toHaveBeenCalledTimes(1);
});
it('prevents overlapping calls and never collects while another process holds the lease',async()=>{
  const {scheduler,deps}=setup();const first=scheduler.tick();
  expect(await scheduler.tick()).toMatchObject({busy:true});await first;
  const second=setup({locked:false});await second.scheduler.tick();expect(second.deps.open).not.toHaveBeenCalled();
  expect(deps.fetch).toHaveBeenCalledTimes(1);
});
it('honors a recent database capture even with a different or empty local state file',async()=>{
  const {scheduler,deps}=setup({recent:true});await scheduler.tick();
  expect(deps.open).not.toHaveBeenCalled();expect(deps.save).toHaveBeenCalled();
});
it('can verify collection immediately on operator request while retaining the database lease',async()=>{
  const {scheduler,deps,query}=setup({recent:true});await scheduler.tick(Date.now(),{force:true});
  expect(deps.fetch).toHaveBeenCalledTimes(1);
  expect(query.mock.calls.some(c=>c[0].includes('pg_try_advisory_lock'))).toBe(true);
});
it('rejects a foreign/unbound group before opening a browser',async()=>{
  const {scheduler,deps,release}=setup({bound:false});await scheduler.tick();
  expect(deps.open).not.toHaveBeenCalled();expect(deps.fetch).not.toHaveBeenCalled();expect(release).toHaveBeenCalled();
});
it('records reauthentication without inserting invented zero counters, and releases its lease',async()=>{
  const {scheduler,deps,query}=setup();deps.open.mockRejectedValueOnce(Error('GROUP_SESSION_EXPIRED'));
  await scheduler.tick();expect(deps.fetch).not.toHaveBeenCalled();
  const states=deps.save.mock.calls.at(-1) as unknown as [string,Record<string,{requires_reauth:boolean;error_code:string}>];
  expect(states[1][`${workspace}:${group}`]).toMatchObject({requires_reauth:true,error_code:'GROUP_SESSION_EXPIRED'});
  expect(query.mock.calls.some(c=>c[0].includes('pg_advisory_unlock'))).toBe(true);
});
it('validates the polling interval and does not persist arbitrary exception secrets',async()=>{
  expect(()=>groupScheduleSchema.parse({...config(),interval_minutes:0})).toThrow();
  const {scheduler,deps}=setup();deps.open.mockRejectedValueOnce(Error('private-token-value provider error'));
  await scheduler.tick();expect(JSON.stringify(deps.save.mock.calls)).not.toContain('private-token-value');
});
