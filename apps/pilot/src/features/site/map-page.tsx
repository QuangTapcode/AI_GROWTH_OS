import { SiteHeader,SiteFooter } from './chrome';
import { TRIPC_MAP_URL } from '@/lib/external-map';
import type { Locale } from '@/lib/locale';
/** Keep old local bookmarks useful without a map, location request or provider call. */
export function TripCMap({locale}:{locale:Locale}){
  const vi=locale==='vi';
  return <div className="site-wrap" lang={locale}><SiteHeader locale={locale} alternatePath={vi?'/map/':'/vi/map/'}/><main className="article-wrap"><p className="eyebrow">TRIPC / MAP</p><h1>{vi?'Khám phá Đà Nẵng cùng TripC Map':'Explore Da Nang with TripC Map'}</h1><p>{vi?'Xem địa điểm, ảnh và các bộ lọc trên website TripC Map. Liên kết mở trong tab mới.':'Browse places, photos and filters on the TripC Map website. The link opens in a new tab.'}</p><p><a className="button" href={TRIPC_MAP_URL} target="_blank" rel="noopener noreferrer">{vi?'Mở TripC Map':'Open TripC Map'} ↗</a></p><p className="original-language">{vi?'Các thao tác trên tripc.ai do website đó xử lý; dữ liệu bản đồ chưa đồng bộ vào Performance của website này.':'Actions on tripc.ai are handled by that website. Its map activity is not synchronized with this website’s Performance reports.'}</p></main><SiteFooter locale={locale}/></div>;
}
