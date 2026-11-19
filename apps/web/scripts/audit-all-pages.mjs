import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('Console: ' + msg.text());
  });
  page.on('response', res => {
    if (res.status() >= 400 && !res.url().includes('favicon') && !res.url().includes('_next')) {
      errors.push(`HTTP ${res.status()}: ${res.url()}`);
    }
  });

  // 1. Login
  await page.goto('http://127.0.0.1:3000/login');
  await page.fill('input[type="email"]', 'owner.tripc.demo@gmail.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  const testPages = [
    '/dashboard',
    '/agents',
    '/agents/community',
    '/agents/research',
    '/agents/growth_lead',
    '/agents/seo',
    '/agents/content',
    '/agents/performance',
    '/workflows',
    '/artifacts',
    '/review-queue',
    '/distribution',
    '/growth-results',
    '/workspace',
    '/knowledge-contexts'
  ];

  console.log('--- STARTING ALL-PAGE AUDIT ---');
  for (const p of testPages) {
    errors.length = 0;
    await page.goto('http://127.0.0.1:3000' + p);
    await page.waitForTimeout(2500);
    if (errors.length === 0) {
      console.log(`✅ [PASS] ${p} (0 errors)`);
    } else {
      console.log(`❌ [FAIL] ${p} (${errors.length} errors):`);
      errors.forEach(e => console.log('    ', e));
    }
  }

  await browser.close();
}

run().catch(console.error);
