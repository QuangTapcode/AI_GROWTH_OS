import { chromium } from 'playwright';

async function run() {
  // 1. Fetch valid session token via API
  const loginRes = await fetch('http://127.0.0.1:4000/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner.tripc.demo@gmail.com', password: 'password123' })
  });
  const loginData = await loginRes.json();
  const session = {
    token: loginData.access_token,
    expiresAt: loginData.expires_at,
    user: loginData.user
  };
  console.log('Got session token:', session.token ? 'OK' : 'FAIL');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Listen to console and response errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('🔴 Console Error:', msg.text());
      errors.push(msg.text());
    }
  });
  page.on('response', res => {
    if (res.status() >= 400 && !res.url().includes('favicon')) {
      console.log(`🔴 HTTP ${res.status()}: ${res.url()}`);
      errors.push(`HTTP ${res.status()}: ${res.url()}`);
    }
  });

  // 2. Open /login, inject session into localStorage, and set cookie
  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate((sess) => {
    localStorage.setItem('agos.session', JSON.stringify(sess));
    localStorage.setItem('agos.workspace', '10000000-0000-4000-8000-000000000001');
  }, session);

  // 3. Navigate to /growth-results
  console.log('Navigating to /growth-results...');
  await page.goto('http://127.0.0.1:3000/growth-results', { waitUntil: 'domcontentloaded' });
  await page.locator('text=Loading workspace').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.locator('h1:has-text("Growth Results")').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await page.locator('text=Loading growth results').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // 4. Check for error banner
  const hasError = await page.locator('text=Could not load data from the API').isVisible().catch(() => false);
  console.log('Has error banner on UI?', hasError ? 'YES (FAILED)' : 'NO (CLEAN & WORKING!)');
  console.log('Total console/HTTP errors:', errors.length);

  await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/growth-results-verified.png', fullPage: true });
  console.log('Saved screenshot: growth-results-verified.png');

  await browser.close();
}

run().catch(console.error);
