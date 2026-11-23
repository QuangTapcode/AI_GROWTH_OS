import { TRIPC_MAP_URL } from '@/lib/external-map';
import Link from 'next/link';
import { copy,homePath,privacyPath,type Locale } from '@/lib/locale';
import { AnalyticsSettings } from './analytics';

export function SiteHeader({locale,alternatePath}:{locale:Locale;alternatePath?:string}){
  const t=copy[locale],home=homePath(locale);
  return <header className="site-header"><Link className="brand" href={home} aria-label="TripC home"><span className="brand-mark" aria-hidden="true">✳</span>TripC<span className="brand-dot">.</span></Link>
    <nav aria-label={locale==='vi'?'Điều hướng chính':'Main navigation'}><a href={TRIPC_MAP_URL} target="_blank" rel="noopener noreferrer">{locale==='vi'?'Bản đồ':'Map'} ↗</a><Link href={`${home}#guides`}>{t.guides}</Link><Link href={`${home}#how-it-works`}>{t.about}</Link></nav>
    <div className="header-actions"><Link className="language-switch" href={alternatePath??homePath(locale==='en'?'vi':'en')} lang={locale==='en'?'vi':'en'} aria-label={locale==='en'?'Chuyển sang tiếng Việt':'Switch to English'}>{locale==='en'?'VI':'EN'} <span aria-hidden="true">↗</span></Link><Link className="button button-small" href={`${home}#request`}>{t.ask}<span aria-hidden="true">↗</span></Link></div>
  </header>;
}
export function SiteFooter({locale}:{locale:Locale}){
  const t=copy[locale];
  return <footer className="site-footer"><div><Link className="brand" href={homePath(locale)}>TripC<span className="brand-dot">.</span></Link><p>{t.footer}</p></div><div className="footer-links"><Link href={`${homePath(locale)}#guides`}>{t.guides}</Link><Link href={privacyPath(locale)}>{t.privacy}</Link><Link href={locale==='vi'?'/vi/photo-credits/':'/photo-credits/'}>{locale==='vi'?'Nguồn ảnh':'Photo credits'}</Link><AnalyticsSettings vi={locale==='vi'}/><span>© {new Date().getUTCFullYear()} TripC</span></div></footer>;
}
