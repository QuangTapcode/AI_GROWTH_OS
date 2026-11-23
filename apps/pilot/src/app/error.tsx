'use client';
import Link from 'next/link';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="not-found"><p className="eyebrow">TRIPC</p><h1>A short pause.</h1><p>We cannot load this page right now. Please try again.<br/>Chưa thể tải trang. Bạn vui lòng thử lại.</p><button className="button" onClick={reset}>Try again / Thử lại ↻</button><Link className="text-link" style={{marginTop:20}} href="/">Home / Trang chủ</Link></main>;}
