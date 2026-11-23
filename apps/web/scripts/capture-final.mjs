import { chromium } from 'playwright';

async function captureFinalScreenshots() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Login
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

  const basePath = 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/inspection';

  const views = [
    { name: 'review-queue', url: 'http://127.0.0.1:3000/review-queue', file: 'final_review_queue.png' },
    { name: 'distribution', url: 'http://127.0.0.1:3000/distribution', file: 'final_distribution.png' },
    { name: 'workflows', url: 'http://127.0.0.1:3000/workflows', file: 'final_workflows.png' },
    { name: 'growth-results', url: 'http://127.0.0.1:3000/growth-results', file: 'final_growth_results.png' },
    { name: 'agents', url: 'http://127.0.0.1:3000/agents', file: 'final_agents.png' },
    { name: 'dashboard', url: 'http://127.0.0.1:3000/dashboard', file: 'final_dashboard.png' }
  ];

  for (const v of views) {
    console.log(`Navigating to ${v.url}...`);
    await page.goto(v.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const dest = `${basePath}/${v.file}`;
    await page.screenshot({ path: dest, fullPage: true });
    console.log(`Saved screenshot: ${dest}`);
  }

  await browser.close();
  console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

captureFinalScreenshots().catch(console.error);

