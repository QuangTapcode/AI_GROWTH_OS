'use client';
/* Locally hosted licensed photography also serves as the image fallback. */
import { useState } from 'react';
import { photos } from '@/lib/photos';
export function GuideMedia({src,alt,priority=false}:{src?:string;alt:string;priority?:boolean}){
  const [failed,setFailed]=useState(false);
  return <img className="guide-photo" src={!failed&&src?src:photos.coast.src} alt={alt} width={1400} height={1050} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'} decoding="async" onError={()=>setFailed(true)}/>;
}
