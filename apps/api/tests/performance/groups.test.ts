import { expect,it,vi } from 'vitest';
import type { Pool } from 'pg';
import { recordGroupObservation } from '../../src/modules/performance/groups';

const sample=()=>({workspace_id:'11111111-1111-4111-8111-111111111111',group_id:'1134282109069209',source:'facebook_group_browser',
  captured_at:new Date().toISOString(),period_from:'2026-10-12',period_to:'2026-11-08',timezone:'provider_unspecified',
  metrics:{posts:6,comments:1,reactions:2,new_members:null},total_members:7,
  source_url:'https://www.facebook.com/groups/1134282109069209/insights/?section=engagement',missing_reasons:{new_members:'COUNTER_NOT_VISIBLE'}});
it('rejects an unbound group before storing observations',async()=>{
  const query=vi.fn(async()=>({rows:[]})),connect=vi.fn();
  await expect(recordGroupObservation({query,connect} as unknown as Pool,sample())).rejects.toMatchObject({code:'GROUP_NOT_BOUND'});
  expect(connect).not.toHaveBeenCalled();
});
it('rejects an unrelated source URL',async()=>{
  const query=vi.fn();
  await expect(recordGroupObservation({query} as unknown as Pool,{...sample(),source_url:'https://www.facebook.com/groups/99999/'})).rejects.toMatchObject({code:'GROUP_SOURCE_MISMATCH'});
  expect(query).not.toHaveBeenCalled();
});
it('stores missing new members separately from a measured current total',async()=>{
  const writes=vi.fn(async(_sql:string,_args?:unknown[])=>({rows:[]})),release=vi.fn();
  const pool={query:vi.fn(async()=>({rows:[{id:'channel'}]})),connect:vi.fn(async()=>({query:writes,release}))} as unknown as Pool;
  await expect(recordGroupObservation(pool,sample())).resolves.toMatchObject({stored:true,post_recorded:false});
  const inserts=writes.mock.calls.filter(c=>String(c[0]).startsWith('INSERT')) as unknown as [string,unknown[]][];
  expect(inserts.find(([,a])=>a[1]==='group_new_members')?.[1].slice(5,8)).toEqual([null,'missing','COUNTER_NOT_VISIBLE']);
  expect(inserts.find(([,a])=>a[1]==='group_total_members')?.[1][5]).toBe(7);
  expect(release).toHaveBeenCalled();
});
