declare global {
  interface Window {dataLayer?:unknown[];gtag?:(...args:unknown[])=>void;tripcGaInitialized?:boolean;tripcGaPage?:string;}
}
export const ANALYTICS_KEY='tripc_analytics_consent';
export const analyticsId=()=>{
  const id=process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID??'';
  return /^G-[A-Z0-9]+$/.test(id)?id:null;
};
export function analyticsConsent():string|null{
  try{return localStorage.getItem(ANALYTICS_KEY);}catch{return null;}
}
export function trackPage(path:string){
  const id=analyticsId();if(!id||analyticsConsent()!=='granted')return;
  Reflect.set(window,`ga-disable-${id}`,false);
  if(!window.tripcGaInitialized){
    window.dataLayer=window.dataLayer??[];
    window.gtag=window.gtag??function(...args:unknown[]){window.dataLayer!.push(args);};
    window.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    window.gtag('js',new Date());
    window.gtag('config',id,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});
    window.tripcGaInitialized=true;
  }
  if(window.tripcGaPage===path)return;
  window.tripcGaPage=path;
  // Do not copy arbitrary query strings, form values or fragments into Google Analytics.
  window.gtag?.('event','page_view',{page_location:new URL(path,location.origin).href,page_title:document.title,send_to:id});
}
export function analyticsEvent(event:'cta_click'|'generate_lead',slug:string|null){
  const id=analyticsId();
  if(!id||analyticsConsent()!=='granted'||!window.tripcGaInitialized)return;
  window.gtag?.('event',event,{...(slug?{content_slug:slug}:{}),send_to:id});
}
