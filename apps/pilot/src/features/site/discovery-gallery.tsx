'use client';
import { useEffect,useRef,useState } from 'react';
import { photos,type SitePhoto } from '@/lib/photos';
import { copy,type Locale } from '@/lib/locale';
import type { Category } from '@/lib/guides';
import { GuideMedia } from './guide-media';
const categorySlides:Record<Category,SitePhoto[]>={housing:[photos.apartment,photos.city],work:[photos.cafe,photos.coffee],life:[photos.market,photos.cafe],travel:[photos.beach,photos.bridgeRiver,photos.bridgeCity,photos.coast]};
const slideCount=Math.max(...Object.values(categorySlides).map(slides=>slides.length));
export function DiscoveryGallery({locale,category,onChoose}:{locale:Locale;category:Category|'all';onChoose:(category:Category)=>void}){
  const vi=locale==='vi',t=copy[locale],root=useRef<HTMLDivElement>(null);
  const [index,setIndex]=useState(0),[paused,setPaused]=useState(false),[reduced,setReduced]=useState(true),[visible,setVisible]=useState(false),[tabVisible,setTabVisible]=useState(true);
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),sync=()=>setReduced(media.matches);sync();media.addEventListener('change',sync);const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{threshold:.15});if(root.current)observer.observe(root.current);const visibility=()=>setTabVisible(!document.hidden);visibility();document.addEventListener('visibilitychange',visibility);return()=>{media.removeEventListener('change',sync);observer.disconnect();document.removeEventListener('visibilitychange',visibility);};},[]);
  const playing=!paused&&!reduced&&visible&&tabVisible;
  useEffect(()=>{if(!playing)return;const timer=setInterval(()=>setIndex(value=>(value+1)%slideCount),3000);return()=>clearInterval(timer);},[playing]);
  return <div className="discovery-gallery" ref={root} data-slide={index} data-playing={playing}>
    <div className="discovery-toolbar"><span>{vi?'Một góc nhìn mới về Đà Nẵng':'A fresh view of Da Nang'}</span><div>{!reduced&&<button type="button" aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?(vi?'Tiếp tục chuyển ảnh':'Resume slideshow'):(vi?'Tạm dừng chuyển ảnh':'Pause slideshow')}</button>}<button type="button" onClick={()=>{setIndex(value=>(value+1)%slideCount);}}>{vi?'Ảnh tiếp theo':'Next photos'} <span aria-hidden="true">→</span></button></div></div>
    <div className="discovery-grid" aria-label={vi?'Khám phá theo nhu cầu':'Explore by interest'}>{(['housing','work','life','travel'] as const).map((key,card)=><button key={key} type="button" className={`discovery-card discovery-${key}`} aria-pressed={category===key} onClick={()=>onChoose(key)}><div className="discovery-frames" style={{transform:`translateX(-${(index%categorySlides[key].length)*100}%)`}} aria-hidden="true">{categorySlides[key].map((photo,offset)=>{return <div className={`discovery-frame ${index%categorySlides[key].length===offset?'is-current':''}`} key={photo.src}><GuideMedia src={photo.src} alt=""/></div>;})}</div><span className="discovery-shade" aria-hidden="true"/><span className="discovery-caption"><small>0{card+1}</small><strong>{t[key]}</strong><span aria-hidden="true">↗</span></span></button>)}</div>
  </div>;
}
