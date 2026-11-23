import { chromium } from 'playwright';

async function traceReview() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.type(), msg.text()));
  page.on('response', res => {
    if (res.url().includes('/v1/')) {
      console.log('API_RESP:', res.status(), res.url().split('?')[0]);
    }
  });

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

  console.log('Navigating to /review-queue...');
  await page.goto('http://127.0.0.1:3000/review-queue', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000);

  const mainText = await page.locator('main').innerText();
  console.log('Main snippet:', mainText.slice(0, 400).replace(/\n/g, ' '));
  const screenshotPath = 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/inspection/review-queue-trace.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved:', screenshotPath);
  await browser.close();
}

traceReview().catch(console.error);
