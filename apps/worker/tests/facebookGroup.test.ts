import { describe,expect,it } from 'vitest';
import { visibleInteger,vietnamesePeriod,groupUrl,visibleShares } from '../src/publish/FacebookGroupBrowser';

describe('Facebook group browser observations',()=>{
  it('reads the post share count from its accessibility label without treating the action as zero',()=>{
    expect(visibleShares('1','Chia sẻ bài viết, 1 lượt chia sẻ')).toBe(1);
    expect(visibleShares('0 lượt chia sẻ')).toBe(0);
    expect(visibleShares('2 chia sẻ')).toBe(2);
    expect(visibleShares('Chia sẻ','Chia sẻ bài viết')).toBeNull();
    expect(visibleShares('','1,2K lượt chia sẻ')).toBeNull();
  });
  it('preserves an explicit zero but does not invent a hidden counter',()=>{
    expect(visibleInteger('0 bình luận','bình luận')).toBe(0);
    expect(visibleInteger('Bình luận','bình luận')).toBeNull();
    expect(visibleInteger('1,2K bình luận','bình luận')).toBeNull();
    expect(visibleInteger('7 thành viên','thành viên')).toBe(7);
  });
  it('uses the provider date range and rejects invalid dates',()=>{
    expect(vietnamesePeriod('6 bài viết\n12 Tháng 10, 2026 - 8 Tháng 11, 2026')).toEqual({from:'2026-10-12',to:'2026-11-08'});
    expect(vietnamesePeriod('31 Tháng 2, 2026 - 8 Tháng 11, 2026')).toBeNull();
    expect(vietnamesePeriod('28 ngày qua')).toBeNull();
    expect(()=>groupUrl('1134282109069209/other')).toThrow('INVALID_GROUP_ID');
  });
});
