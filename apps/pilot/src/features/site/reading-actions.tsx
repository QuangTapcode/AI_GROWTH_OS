'use client';
import { useEffect,useState } from 'react';
import { postPath,type Locale } from '@/lib/locale';
export const SAVED_KEY='tripc_saved_guides_v1';
export function readSaved():string[]{try{const value=JSON.parse(localStorage.getItem(SAVED_KEY)??'[]');return Array.isArray(value)?value.filter((v):v is string=>typeof v==='string').slice(0,200):[];}catch{return [];}}
export function ReadingActions({slug,title,locale}:{slug:string;title:string;locale:Locale}){
  const vi=locale==='vi',[saved,setSaved]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{const sync=()=>setSaved(readSaved().includes(slug));sync();window.addEventListener('tripc-saved',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('tripc-saved',sync);window.removeEventListener('storage',sync);};},[slug]);
  function toggle(){try{const items=readSaved(),next=items.includes(slug)?items.filter(s=>s!==slug):[slug,...items].slice(0,200);localStorage.setItem(SAVED_KEY,JSON.stringify(next));window.dispatchEvent(new Event('tripc-saved'));setMessage(next.includes(slug)?(vi?'Đã lưu trên trình duyệt này.':'Saved on this browser.'):(vi?'Đã bỏ lưu.':'Removed from saved guides.'));}catch{setMessage(vi?'Trình duyệt không cho phép lưu.':'Browser storage is unavailable.');}}
  async function share(){const url=new URL(postPath(slug,locale),location.origin).href;try{if(navigator.share){await navigator.share({title,url});setMessage(vi?'Đã chia sẻ.':'Shared.');}else{await navigator.clipboard.writeText(url);setMessage(vi?'Đã sao chép liên kết.':'Link copied.');}}catch(error){if(!(error instanceof Error&&error.name==='AbortError'))setMessage(vi?'Không thể chia sẻ. Hãy sao chép địa chỉ trên trình duyệt.':'Unable to share. Copy the browser address instead.');}}
  return <div className="reading-actions"><button type="button" className="button button-outline" aria-pressed={saved} onClick={toggle}>{saved?(vi?'Đã lưu':'Saved'):(vi?'Lưu bài':'Save guide')}</button><button type="button" className="button button-outline" onClick={share}>{vi?'Chia sẻ bài':'Share guide'}</button><span className="action-feedback" aria-live="polite">{message}</span></div>;
}
