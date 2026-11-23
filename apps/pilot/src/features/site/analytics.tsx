'use client';
import Script from 'next/script';
import Link from 'next/link';
import { useEffect,useState,useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { ANALYTICS_KEY,analyticsConsent,analyticsId,trackPage } from '@/lib/analytics';

function subscribe(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener('tripc-consent',callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener('tripc-consent',callback);};}
export function Analytics(){
  const id=analyticsId(),path=usePathname(),vi=path==='/vi'||path.startsWith('/vi/');
  const consent=useSyncExternalStore(subscribe,analyticsConsent,()=>null);
  const [ready,setReady]=useState(false),[open,setOpen]=useState(false);
  useEffect(()=>{const listener=()=>setOpen(true);window.addEventListener('tripc-consent-settings',listener);return()=>window.removeEventListener('tripc-consent-settings',listener);},[]);
  useEffect(()=>{if(ready&&consent==='granted')trackPage(path);},[ready,consent,path]);
  function choose(value:'granted'|'denied'){
    try{localStorage.setItem(ANALYTICS_KEY,value);}catch{setOpen(false);return;}
    if(id){Reflect.set(window,`ga-disable-${id}`,value==='denied');window.gtag?.('consent','update',{analytics_storage:value,ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});}
    if(value==='denied')window.tripcGaPage=undefined;
    window.dispatchEvent(new Event('tripc-consent'));setOpen(false);
  }
  if(!id)return null;
  return <>{consent==='granted'&&<Script id="tripc-google-tag" src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" onReady={()=>setReady(true)}/>}{(consent===null||open)&&<aside className="analytics-banner" aria-label={vi?'Lựa chọn phân tích':'Analytics choice'}><div><strong>{vi?'Giúp TripC hiểu điều hữu ích với bạn':'Help us make TripC a little more useful.'}</strong><p>{vi?'Cho phép Google Analytics tùy chọn để hiểu cách website được sử dụng. Biểu mẫu vẫn hoạt động nếu bạn từ chối.':'Allow optional Google Analytics to understand how the site is used. The enquiry form works either way.'} <Link href={vi?'/vi/privacy/':'/privacy/'}>{vi?'Tìm hiểu thêm':'Learn more'}</Link></p></div><div className="analytics-actions"><button className="button button-outline" onClick={()=>choose('denied')}>{vi?'Từ chối':'Decline'}</button><button className="button" onClick={()=>choose('granted')}>{vi?'Cho phép':'Allow analytics'}</button></div></aside>}</>;
}
export function AnalyticsSettings({vi}:{vi:boolean}){return analyticsId()?<button className="analytics-settings" onClick={()=>window.dispatchEvent(new Event('tripc-consent-settings'))}>{vi?'Cài đặt phân tích':'Analytics settings'}</button>:null;}
