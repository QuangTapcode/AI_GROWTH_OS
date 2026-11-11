import { GuideMedia } from './guide-media';
import { ReadingActions } from './reading-actions';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost,listPosts } from '@/lib/site';
import { copy,homePath,postPath,type Locale } from '@/lib/locale';
import { siteUrl } from '@/lib/metadata';
import { guideCard } from '@/lib/guides';
import { relatedPosts } from '@/lib/related';
import { ArticleBody,parseArticle } from './article';
import { SiteHeader,SiteFooter } from './chrome';
import { CommunityGroupCard,CtaButton,LeadForm,PageView } from './measure';

export async function guideParams(){return (await listPosts()).map(p=>({slug:p.slug}));}
export async function guideMetadata(slug:string):Promise<Metadata>{
  const post=await getPost(slug),origin=siteUrl();
  if(!post)return {title:'Guide not found',robots:{index:false,follow:false}};
  // The article remains in its original language; both UI routes point at the same canonical content.
  const canonical=origin?new URL(postPath(post.slug,'en'),origin).href:undefined;
  return {title:post.title,description:post.meta.description,alternates:canonical?{canonical}:undefined,
    openGraph:{type:'article',title:post.title,description:post.meta.description,url:canonical,publishedTime:post.published_at,siteName:'TripC'}};
}
export async function TripCPost({slug,locale}:{slug:string;locale:Locale}){
  const post=await getPost(slug);if(!post)notFound();
  const t=copy[locale],{blocks,sources,cta}=parseArticle(post.body),related=relatedPosts(post,await listPosts());
  return <div className="site-wrap" lang={locale}><SiteHeader locale={locale} alternatePath={postPath(slug,locale==='en'?'vi':'en')}/><main className="article-wrap"><PageView slug={post.slug}/>
    <Link className="article-back" href={`${homePath(locale)}#guides`}>← {t.back}</Link><article><p className="eyebrow">TRIPC / {t.guides}</p><h1>{post.title}</h1><div className="article-meta"><time dateTime={post.published_at}>{new Date(post.published_at).toLocaleDateString(locale==='vi'?'vi-VN':'en-GB',{dateStyle:'long',timeZone:'UTC'})}</time><span>{guideCard(post).minutes} {t.minutes}</span></div>{locale==='vi'&&<p className="original-language">{t.original}</p>}<div className="article-cover"><GuideMedia src={guideCard(post).image} alt="" priority/></div><ReadingActions slug={post.slug} title={post.title} locale={locale}/><div className="article-body"><ArticleBody blocks={blocks}/></div><CtaButton slug={post.slug} label={cta??t.ask}/>
      {sources.length>0&&<section className="sources" aria-labelledby="sources"><h2 id="sources">{t.sources}</h2><ul>{sources.map(url=><li key={url}><a href={url} rel="noopener nofollow" target="_blank">{new URL(url).hostname} ↗</a></li>)}</ul></section>}
      {related.length>0&&<section className="sources" aria-labelledby="related"><h2 id="related">{t.related}</h2><ul>{related.map(p=><li key={p.slug}><Link href={postPath(p.slug,locale)}>{p.title}</Link></li>)}</ul></section>}
    </article><section id="request" className="article-request" aria-labelledby="request-title"><p className="eyebrow">TRIPC / {t.ask}</p><h2 id="request-title">{locale==='vi'?'Cần thêm chỉ dẫn?':'A question on your mind?'}</h2><LeadForm topic={post.title} slug={post.slug} locale={locale}/></section><CommunityGroupCard slug={post.slug} locale={locale}/></main><SiteFooter locale={locale}/></div>;
}
