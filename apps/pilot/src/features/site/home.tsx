import { VisitorChat } from './visitor-chat';
import { TRIPC_MAP_URL } from '@/lib/external-map';
import { copy,type Locale } from '@/lib/locale';
import { postsResult } from '@/lib/site';
import { guideCard } from '@/lib/guides';
import { SiteHeader,SiteFooter } from './chrome';
import { GuideMedia } from './guide-media';
import { GuideExplorer } from './guides';
import { CommunityGroupCard,CtaButton,PageView } from './measure';

export async function TripCHome({locale}:{locale:Locale}){
  const t=copy[locale],collection=await postsResult();
  return <div lang={locale} className="site-wrap"><a className="skip-link" href="#main">{locale==='vi'?'Đến nội dung chính':'Skip to content'}</a><SiteHeader locale={locale}/><main id="main"><PageView slug={null}/>
    <section className="hero"><div className="hero-copy"><p className="eyebrow"><span className="status-dot"/>{t.tag}</p><h1>{t.title}</h1><p className="hero-intro">{t.intro}</p><div className="hero-actions"><a className="button" href={TRIPC_MAP_URL} target="_blank" rel="noopener noreferrer">{locale==='vi'?'Khám phá bản đồ':'Explore the map'} ↗</a><a className="button button-outline" href="#guides">{t.browse}<span aria-hidden="true">↗</span></a><CtaButton slug={null} label={t.ask}/></div><div className="hero-note"><span className="note-line"/><p>{locale==='vi'?'Dành cho những khởi đầu, lớn và nhỏ.':'For beginnings, big and small.'}<br/><strong>Da Nang, Vietnam · 16.0544° N, 108.2022° E</strong></p></div></div><div className="hero-visual"><GuideMedia alt={locale==='vi'?'Ảnh chụp bờ biển Mỹ Khê, Đà Nẵng':'Photograph of My Khe Beach coastline, Da Nang'} priority/><div className="illustration-label"><span aria-hidden="true">↗</span><div><strong>{locale==='vi'?'Tìm một nơi thuộc về bạn.':'A city to make your own.'}</strong><span>Da Nang · Vietnam</span></div></div><span className="vertical-caption" aria-hidden="true">COASTAL DAYS / LOCAL WAYS</span></div></section>
    <div className="topic-strip" aria-label={locale==='vi'?'Nội dung TripC':'What you will find'}>{(['housing','work','life','travel'] as const).map((key,i)=><a href="#guides" key={key}><span className="topic-index">0{i+1}</span>{t[key]}<span aria-hidden="true">↗</span></a>)}</div>
    <GuideExplorer posts={collection.posts.map(guideCard)} unavailable={collection.unavailable} locale={locale}/>
    <section id="how-it-works" className="how-section section-space" aria-labelledby="how-title"><div className="section-heading"><div><p className="eyebrow">{locale==='vi'?'THEO CÁCH CỦA BẠN':'ON YOUR OWN TERMS'}</p><h2 id="how-title">{t.stepsTitle}</h2><p className="section-intro">{t.stepsIntro}</p></div><span className="section-number" aria-hidden="true">02 /</span></div><div className="steps-grid">{t.steps.map(([title,text],i)=><div className="step" key={title}><span className="step-number">0{i+1}</span><h3>{title}</h3><p>{text}</p></div>)}</div></section>
    <section className="contact-section section-space" id="request" aria-labelledby="request-title"><div className="contact-copy"><p className="eyebrow">{t.contactEyebrow}</p><h2 id="request-title">{t.contactTitle}</h2><p>{t.contactIntro}</p><div className="contact-ornament" aria-hidden="true">hello<span>xin chào</span></div></div><div className="contact-card"><span className="form-caption">TRIPC / {locale==='vi'?'KẾT NỐI':'LET’S CONNECT'}</span><VisitorChat locale={locale}/></div></section>
    <div className="section-space"><CommunityGroupCard slug={null} locale={locale}/></div>
    <section className="faq-section section-space" aria-labelledby="faq-title"><div><p className="eyebrow">{locale==='vi'?'GIẢI ĐÁP NHANH':'A LITTLE CLARITY'}</p><h2 id="faq-title">{t.faq}</h2></div><div className="faq-list">{t.questions.map(([q,a])=><details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>
  </main><SiteFooter locale={locale}/></div>;
}
