import { chromium } from 'playwright';
const out = 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/inspection/real_data_community.png';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await (await b.newContext({ viewport: { width: 1440, height: 2200 } })).newPage();
const r = await fetch('http://127.0.0.1:4000/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner.tripc.demo@gmail.com', password: 'password123' }) });
const { access_token, user, expires_at } = await r.json();
await p.goto('http://127.0.0.1:3000/login');
await p.evaluate(({ t, e, u }) => { localStorage.setItem('agos.session', JSON.stringify({ token: t, expiresAt: e, user: u })); localStorage.setItem('agos.workspace', '10000000-0000-4000-8000-000000000001'); }, { t: access_token, e: expires_at, u: user });
await p.goto('http://127.0.0.1:3000/agents/community', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForTimeout(25000);
const txt = await p.locator('body').innerText();
console.log('has Apartment Viewing:', txt.includes('Apartment Viewing'));
console.log('has fallback Cam nang Da Nang 2026:', txt.includes('Cẩm nang du lịch trải nghiệm Đà Nẵng 2026'));
console.log('has error banner:', /Could not load|INTERNAL_ERROR|DATABASE_UNAVAILABLE/.test(txt));
console.log('real group link:', await p.locator('a[href*="1134282109069209"]').count());
await p.screenshot({ path: out, fullPage: false });
await b.close();

