import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // 1. Login
  await page.goto('http://127.0.0.1:3000/login');
  await page.fill('input[type="email"]', 'owner.tripc.demo@gmail.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  // 2. Go to /agents
  await page.goto('http://127.0.0.1:3000/agents');
  await page.locator('text=Loading workspace').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.locator('h1:has-text("Agent Operations")').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await page.locator('text=Đang tải trạng thái agent').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/agents-verified-fixed.png', fullPage: true });

  // 2b. Go to /agents/community
  await page.goto('http://127.0.0.1:3000/agents/community');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/agents-community-verified.png', fullPage: true });

  // 2c. Go to /growth-results
  await page.goto('http://127.0.0.1:3000/growth-results');
  await page.locator('text=Loading workspace').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.locator('h1:has-text("Growth Results")').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await page.locator('text=Loading growth results').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/growth-results-verified.png', fullPage: true });

  // 3. Go to /onboarding
  await page.goto('http://127.0.0.1:3000/onboarding');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/onboarding-verified-fixed.png', fullPage: true });

  // 4. Go to /gmaps
  await page.goto('http://127.0.0.1:3000/gmaps');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/gmaps-verified-fixed.png', fullPage: true });

  console.log('All 3 screenshots saved successfully!');
  await browser.close();
}

run().catch(console.error);
