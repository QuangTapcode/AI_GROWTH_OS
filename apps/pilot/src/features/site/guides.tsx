'use client';
import { DiscoveryGallery } from './discovery-gallery';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import { GuideMedia } from './guide-media';
import { ReadingActions,readSaved } from './reading-actions';
import { copy,homePath,postPath,type Locale } from '@/lib/locale';
import { filterGuides,type Category,type GuideCard } from '@/lib/guides';

export function GuideExplorer({posts,unavailable,locale}:{posts:GuideCard[];unavailable:boolean;locale:Locale}){
  const t=copy[locale],[query,setQuery]=useState(''),[category,setCategory]=useState<Category|'all'>('all');
  const [savedOnly,setSavedOnly]=useState(false),[saved,setSaved]=useState<string[]>([]);
  useEffect(()=>{const sync=()=>setSaved(readSaved());sync();window.addEventListener('tripc-saved',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('tripc-saved',sync);window.removeEventListener('storage',sync);};},[]);
  const results=filterGuides(posts,query,category).filter(p=>!savedOnly||saved.includes(p.slug));
  const featured=[...posts].sort((a,b)=>b.published_at.localeCompare(a.published_at))[0];
  return <section id="guides" className="guides-section section-space" aria-labelledby="guides-title">
    <DiscoveryGallery locale={locale} category={category} onChoose={key=>{setCategory(key);setSavedOnly(false);setQuery('');document.getElementById('guides-title')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}}/>
    {!unavailable&&featured&&<aside className="featured-guide"><GuideMedia src={featured.image} alt=""/><div><p className="eyebrow">{locale==='vi'?'CẨM NANG MỚI NHẤT':'LATEST GUIDE'}</p><h2><Link href={postPath(featured.slug,locale)}>{featured.title}</Link></h2><p>{featured.description}</p><Link className="text-link" href={postPath(featured.slug,locale)}>{t.read} ↗</Link></div></aside>}
    {posts.length>0&&<button className="saved-filter button button-outline" type="button" aria-pressed={savedOnly} onClick={()=>setSavedOnly(!savedOnly)}>{locale==='vi'?'Chỉ xem bài đã lưu':'Saved guides only'} ({posts.filter(p=>saved.includes(p.slug)).length})</button>}
    <div className="section-heading"><div><p className="eyebrow">{t.eyebrow}</p><h2 id="guides-title">{t.guideTitle}</h2><p className="section-intro">{t.guideIntro}</p></div><span className="section-number" aria-hidden="true">01 /</span></div>
    {!unavailable&&posts.length>0&&<div className="guide-controls"><div className="filter-tabs" role="group" aria-label={locale==='vi'?'Chủ đề':'Topics'}>{(['all','housing','work','life','travel'] as const).map(key=><button type="button" key={key} aria-pressed={category===key} onClick={()=>setCategory(key)}>{key==='all'?t.all:t[key]}</button>)}</div><label className="search-field"><span aria-hidden="true">⌕</span><span className="sr-only">{t.search}</span><input type="search" placeholder={t.search} value={query} maxLength={200} onChange={e=>setQuery(e.target.value)}/></label></div>}
    {unavailable?<div className="empty-guides"><span className="empty-symbol" aria-hidden="true">↻</span><h3>{t.unavailable}</h3><p>{t.unavailableText}</p><a className="text-link" href={`${homePath(locale)}#guides`}>{locale==='vi'?'Thử lại':'Try again'} ↗</a></div>:
      posts.length===0?<div className="empty-guides"><span className="empty-symbol" aria-hidden="true">✳</span><h3>{t.noGuides}</h3><p>{t.noGuidesText}</p><a className="text-link" href="#request">{t.ask} ↗</a></div>:
      <><p className="results-count" aria-live="polite">{results.length} {locale==='vi'?'cẩm nang':'guides'}</p><div className="guide-grid">{results.map(post=><article className="guide-card" key={post.slug}><div className={`guide-cover cover-${post.category}`}><GuideMedia src={post.image} alt=""/></div><div className="guide-card-body"><p className="card-category">{t[post.category]} <span>· {post.minutes} {t.minutes}</span></p><h3><Link href={postPath(post.slug,locale)}>{post.title}</Link></h3>{post.description&&<p>{post.description}</p>}<Link className="card-read" href={postPath(post.slug,locale)}>{t.read}<span aria-hidden="true">↗</span></Link><ReadingActions slug={post.slug} title={post.title} locale={locale}/></div></article>)}</div>{results.length===0&&<div className="empty-guides"><h3>{t.noResults}</h3><button className="button button-outline" onClick={()=>{setQuery('');setCategory('all');setSavedOnly(false);}}>{t.reset}</button></div>}</>}
  </section>;
}
