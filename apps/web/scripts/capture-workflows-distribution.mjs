import { chromium } from 'playwright';

async function testAllLoaded() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const loginRes = await fetch('http://127.0.0.1:4000/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner.tripc.demo@gmail.com', password: 'password123' })
  });
  const { access_token, user, expires_at } = await loginRes.json();

  await page.goto('http://127.0.0.1:3000/login');
  await page.evaluate(({ access_token, expires_at, user }) => {
    localStorage.setItem('agos.session', JSON.stringify({ token: access_token, expiresAt: expires_at, user }));
    localStorage.setItem('agos.workspace', '10000000-0000-4000-8000-000000000001');
  }, { access_token, expires_at, user });

  console.log('1. Capturing /workflows...');
  await page.goto('http://127.0.0.1:3000/workflows', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/inspection/workflows-loaded.png', fullPage: true });

  console.log('2. Capturing /distribution...');
  await page.goto('http://127.0.0.1:3000/distribution', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/inspection/distribution-loaded.png', fullPage: true });

  await browser.close();
  console.log('Done capturing all views.');
}

testAllLoaded().catch(console.error);
