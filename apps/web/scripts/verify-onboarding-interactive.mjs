import { chromium } from 'playwright';

async function verifyOnboarding() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

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

  console.log('Navigating to /onboarding...');
  await page.goto('http://127.0.0.1:3000/onboarding', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const dest = 'C:/Users/Administrator/.gemini/antigravity/brain/90b150fc-0a07-47cf-96a6-166c9ffd43ce/inspection/onboarding_interactive.png';
  await page.screenshot({ path: dest, fullPage: true });
  console.log('Saved screenshot:', dest);

  const headerBtn = await page.locator('text=Khởi Tạo Quán').isVisible().catch(() => false);
  console.log('Header has "Khởi Tạo Quán" button:', headerBtn ? 'CÓ ✅' : 'CHƯA ❌');

  const sidebarBtn = await page.locator('text=Khởi tạo Zero-Tech').isVisible().catch(() => false);
  console.log('Sidebar has "Khởi tạo Zero-Tech" link:', sidebarBtn ? 'CÓ ✅' : 'CHƯA ❌');

  const linksCount = await page.locator('a:has-text("Mở ")').count();
  console.log(`Số lượng nút "Mở Agent" trong 8 thẻ: ${linksCount}/8 ✅`);

  await browser.close();
}

verifyOnboarding().catch(console.error);

