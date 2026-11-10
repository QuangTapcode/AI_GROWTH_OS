import { expect,it } from 'vitest';
import { compareSocialObservations, type SocialHistoryRow } from '../../src/modules/performance/socialReport';

const row: SocialHistoryRow = { publishing_job_id:'job',content_id:'content',artifact_id:'artifact',artifact_version:3,content_hash:'hash',title:'Post',
  external_post_id:'123_456',connection_status:'connected',last_error:null,
  baseline:{reactions:{value:2,captured_at:'2026-11-01T00:00:00Z',reason:null},comments:{value:0,captured_at:'2026-11-01T00:00:00Z',reason:null}},
  current:{reactions:{value:5,captured_at:'2026-11-02T00:00:00Z',reason:null},comments:{value:1,captured_at:'2026-11-02T00:00:00Z',reason:null},shares:{value:null,captured_at:'2026-11-02T00:00:00Z',reason:'COUNTER_NOT_RETURNED'}} };
it('computes observed changes and percentages while retaining content provenance',()=>{
  const result=compareSocialObservations(row);
  expect(result.artifact_id).toBe('artifact');expect(result.artifact_version).toBe(3);
  expect(result.comparisons[0]).toMatchObject({absolute_change:3,relative_change_pct:150,status:'compared'});
  expect(result.comparisons[1]).toMatchObject({absolute_change:1,relative_change_pct:null,status:'zero_baseline'});
  expect(result.comparisons[2]).toMatchObject({current_value:null,absolute_change:null,status:'current_missing',missing_reason:'COUNTER_NOT_RETURNED'});
});
it('never treats an absent baseline as zero',()=>{
  expect(compareSocialObservations({...row,baseline:null}).comparisons[0]).toMatchObject({baseline_value:null,current_value:5,absolute_change:null,status:'baseline_missing'});
});
it('keeps negative changes when people remove reactions',()=>{
  expect(compareSocialObservations({...row,current:{reactions:{value:1,captured_at:'2026-11-02T00:00:00Z',reason:null}}}).comparisons[0])
    .toMatchObject({absolute_change:-1,relative_change_pct:-50,status:'compared'});
});
