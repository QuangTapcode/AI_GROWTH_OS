import type { Metadata } from 'next';
import { copy,homePath,type Locale } from './locale';
export function siteUrl():URL|undefined{
  const raw=process.env.NEXT_PUBLIC_SITE_URL;
  if(!raw)return undefined;
  try{const url=new URL(raw);return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?new URL(url.origin):undefined;}catch{return undefined;}
}
export function homeMetadata(locale:Locale):Metadata{
  const origin=siteUrl(),path=homePath(locale),t=copy[locale];
  return {title:{absolute:locale==='vi'?'TripC — Khởi đầu của bạn tại Đà Nẵng':'TripC — Your next chapter in Da Nang'},description:t.intro,
    ...(origin?{alternates:{canonical:new URL(path,origin).href,languages:{en:new URL('/',origin).href,vi:new URL('/vi/',origin).href}},openGraph:{type:'website',url:new URL(path,origin).href,title:t.title,description:t.intro,locale:locale==='vi'?'vi_VN':'en_GB',siteName:'TripC'}}:{})};
}
