'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
export function LocaleDocument(){
  const path=usePathname();
  useEffect(()=>{document.documentElement.lang=path==='/vi'||path.startsWith('/vi/')?'vi':'en';},[path]);
  return null;
}
