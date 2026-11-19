import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. Login
  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', 'owner.tripc.demo@gmail.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  // 2. Go to /growth-results
  await page.goto('http://127.0.0.1:3000/growth-results', { waitUntil: 'domcontentloaded' });
  await page.locator('text=Loading workspace').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.locator('h1:has-text("Growth Results")').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await page.locator('text=Loading growth results').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/growth-results-verified.png', fullPage: true });

  console.log('Saved growth-results-verified.png successfully!');
  await browser.close();
}

run().catch(console.error);
