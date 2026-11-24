import { chromium } from 'playwright';

async function check() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  page.on('response', r => {
    if (r.url().includes('/v1/')) {
      console.log('API RESPONSE:', r.status(), r.url());
    }
  });
  page.on('console', m => console.log('BROWSER CONSOLE:', m.type(), m.text()));

  await page.goto('http://127.0.0.1:3000/login');
  await page.fill('input[type="email"]', 'owner.tripc.demo@gmail.com');
  await page.fill('input[type="password"]', 'password123');
  console.log('Submitting login...');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);
  console.log('Final URL:', page.url());
  await browser.close();
}

check().catch(console.error);
