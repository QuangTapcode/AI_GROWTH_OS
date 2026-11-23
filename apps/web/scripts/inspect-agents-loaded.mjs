import { chromium } from 'playwright';

async function checkAgents() {
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

  console.log('Navigating to /agents...');
  await page.goto('http://127.0.0.1:3000/agents', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  const screenshotPath = 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/inspection/02_agents_fully_rendered.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Saved loaded screenshot:', screenshotPath);
  const text = await page.locator('main').innerText();
  console.log('Main snippet:', text.slice(0, 300).replace(/\n/g, ' '));
  await browser.close();
}

checkAgents().catch(console.error);
